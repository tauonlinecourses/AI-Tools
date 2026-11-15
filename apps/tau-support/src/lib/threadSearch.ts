/**
 * Free-text search across forum questions (title + OP body + replies).
 * Browser goes through `/api/tau-data`; server uses the bound service client.
 */

import { isSupabaseConfigured, supabase } from "./supabase.js";
import {
  MESSAGE_HYDRATE_SELECT,
  THREAD_HYDRATE_SELECT,
  storedEntryFromDbRows,
  type MessageDbRow,
  type ThreadDbRow,
} from "./supabaseHydrate.js";
import {
  activityTimestampMs,
  threadActivityAt,
  type StoredThreadEntry,
} from "./threadStore.js";

export const SEARCH_THREADS_LIMIT = 50;
export const SEARCH_MIN_QUERY_LENGTH = 2;

export type ThreadSearchItem = {
  courseId: string;
  entry: StoredThreadEntry;
};

export type ThreadSearchResult = {
  ok: boolean;
  skipped?: boolean;
  query: string;
  items: ThreadSearchItem[];
  message?: string;
};

/** Escape `%` / `_` so they are literal in Postgres ILIKE patterns. */
export function escapeIlikePattern(raw: string): string {
  return raw.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

function activityMs(row: ThreadDbRow): number {
  return Math.max(
    activityTimestampMs(row.last_activity_at),
    activityTimestampMs(row.created_at)
  );
}

/**
 * Search Supabase `threads` (title + body_text) and `messages` (body_text).
 * Returns up to SEARCH_THREADS_LIMIT hydrated thread entries, newest first.
 */
export async function searchThreads(query: string): Promise<ThreadSearchResult> {
  const trimmed = query.trim();
  if (!isSupabaseConfigured) {
    return {
      ok: false,
      skipped: true,
      query: trimmed,
      items: [],
      message: "Supabase not configured",
    };
  }
  if (typeof window !== "undefined") {
    try {
      const { tauData } = await import("./tauDataClient.js");
      return await tauData<ThreadSearchResult>("searchThreads", {
        query: trimmed,
      });
    } catch (err) {
      return {
        ok: false,
        query: trimmed,
        items: [],
        message:
          err instanceof Error ? err.message : "Failed to search threads",
      };
    }
  }

  if (trimmed.length < SEARCH_MIN_QUERY_LENGTH) {
    return { ok: true, query: trimmed, items: [] };
  }

  try {
    const pattern = `%${escapeIlikePattern(trimmed)}%`;
    // Separate filters avoid PostgREST `.or()` quoting pitfalls with `%` / commas.
    const [titleRes, bodyRes, replyRes] = await Promise.all([
      supabase
        .from("threads")
        .select("campus_thread_id")
        .ilike("title", pattern)
        .limit(SEARCH_THREADS_LIMIT * 2),
      supabase
        .from("threads")
        .select("campus_thread_id")
        .ilike("body_text", pattern)
        .limit(SEARCH_THREADS_LIMIT * 2),
      supabase
        .from("messages")
        .select("thread_id")
        .ilike("body_text", pattern)
        .limit(SEARCH_THREADS_LIMIT * 3),
    ]);

    if (titleRes.error) throw titleRes.error;
    if (bodyRes.error) throw bodyRes.error;
    if (replyRes.error) throw replyRes.error;

    const idSet = new Set<string>();
    for (const row of [...(titleRes.data ?? []), ...(bodyRes.data ?? [])]) {
      const id = (row as { campus_thread_id?: string }).campus_thread_id;
      if (id) idSet.add(id);
    }
    for (const row of replyRes.data ?? []) {
      const id = (row as { thread_id?: string }).thread_id;
      if (id) idSet.add(id);
    }

    if (idSet.size === 0) {
      return { ok: true, query: trimmed, items: [] };
    }

    const ids = [...idSet];
    const threadsRes = await supabase
      .from("threads")
      .select(THREAD_HYDRATE_SELECT)
      .in("campus_thread_id", ids);

    if (threadsRes.error) throw threadsRes.error;

    const threadRows = ((threadsRes.data ?? []) as ThreadDbRow[]).sort(
      (a, b) => activityMs(b) - activityMs(a)
    );
    const limited = threadRows.slice(0, SEARCH_THREADS_LIMIT);
    const limitedIds = limited.map((r) => r.campus_thread_id);

    if (limitedIds.length === 0) {
      return { ok: true, query: trimmed, items: [] };
    }

    const messagesRes = await supabase
      .from("messages")
      .select(MESSAGE_HYDRATE_SELECT)
      .in("thread_id", limitedIds);

    if (messagesRes.error) throw messagesRes.error;

    const messagesByThread = new Map<string, MessageDbRow[]>();
    for (const msg of (messagesRes.data ?? []) as MessageDbRow[]) {
      const list = messagesByThread.get(msg.thread_id) ?? [];
      list.push(msg);
      messagesByThread.set(msg.thread_id, list);
    }

    const now = new Date().toISOString();
    const items: ThreadSearchItem[] = limited.map((row) => ({
      courseId: row.course_id,
      entry: storedEntryFromDbRows(
        row,
        messagesByThread.get(row.campus_thread_id) ?? [],
        now
      ),
    }));

    // Stable newest-first by reconstructed activity (matches inbox ordering feel).
    items.sort(
      (a, b) =>
        activityTimestampMs(threadActivityAt(b.entry.thread)) -
        activityTimestampMs(threadActivityAt(a.entry.thread))
    );

    return { ok: true, query: trimmed, items };
  } catch (err) {
    return {
      ok: false,
      query: trimmed,
      items: [],
      message:
        err instanceof Error ? err.message : "Failed to search threads",
    };
  }
}
