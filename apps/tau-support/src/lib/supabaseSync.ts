/**
 * Persist polled Campus IL threads to the dedicated tau-support Supabase
 * project (Phase 1). Supabase is the durable inbox source of truth across
 * browsers; Campus IL remains the upstream forum. localStorage is a
 * write-through cache only.
 *
 * Design notes:
 * - Fully NON-BLOCKING: any failure (or missing env) returns a result the
 *   caller logs; the localStorage inbox / poll never breaks.
 * - Idempotent UPSERTs keyed on the Campus IL ids, so re-polling a thread
 *   updates rows in place.
 * - Upsert order (courses → threads → messages → qa_pairs) respects the FKs;
 *   qa_pairs.answer_message_id references messages, so messages go first.
 * - Always writes `courses.last_checked_at` when provided so hydrate can
 *   resume incremental polls on another device.
 * - Thread UX flags (`no_answer_needed`, seen / חדש) are shared in DB.
 */

import {
  threadActivityAt,
  type StoredThreadEntry,
} from "./threadStore";
import { findCourseById } from "./courses";
import { buildQaPair, flattenComments, hashContent, toPlainText } from "./qaPairing";
import { supabase } from "./supabase";
import type { ForumThread } from "./types";
import { isStaffAuthor } from "./unanswered";

export interface SyncResult {
  ok: boolean;
  /** True when Supabase isn't configured — not an error, just skipped. */
  skipped?: boolean;
  message?: string;
  threads?: number;
  messages?: number;
  qaPairs?: number;
}

export interface ThreadUiState {
  noAnswerNeeded: boolean;
  seenAt?: string | null;
  isNew: boolean;
  isUpdated: boolean;
}

function nullable(value?: string | null): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

/** Postgres rejects null bytes in text/jsonb; Campus IL bodies sometimes include them. */
function stripNullBytes(value: string | null | undefined): string | null {
  if (value == null) return null;
  const cleaned = value.replace(/\u0000/g, "");
  return cleaned.trim() ? cleaned : null;
}

function formatSyncError(err: unknown, step?: string): string {
  const prefix = step ? `${step}: ` : "";
  if (err instanceof Error) return `${prefix}${err.message}`;
  if (err && typeof err === "object") {
    const e = err as {
      message?: unknown;
      details?: unknown;
      hint?: unknown;
      code?: unknown;
    };
    const parts = [
      typeof e.message === "string" ? e.message : null,
      typeof e.details === "string" ? e.details : null,
      typeof e.hint === "string" ? e.hint : null,
      e.code != null ? `code=${String(e.code)}` : null,
    ].filter((p): p is string => Boolean(p && p.trim()));
    if (parts.length > 0) return `${prefix}${parts.join(" | ")}`;
  }
  return `${prefix}Supabase sync failed`;
}

interface CourseRow {
  id: string;
  name: string;
  name_he: string | null;
  forum_category: string | null;
  last_checked_at?: string | null;
}

interface ThreadContentRow {
  campus_thread_id: string;
  course_id: string;
  title: string | null;
  author: string | null;
  author_label: string | null;
  body_text: string | null;
  body_hash: string | null;
  op_is_staff: boolean;
  comment_count: number | null;
  created_at: string | null;
  last_activity_at: string | null;
  raw: Record<string, unknown>;
  synced_at: string;
}

/** Full thread row including shared inbox UX flags (backfill / explicit UI sync). */
interface ThreadRow extends ThreadContentRow {
  no_answer_needed: boolean;
  seen_at: string | null;
  is_new: boolean;
  is_updated: boolean;
}

interface MessageRow {
  campus_comment_id: string;
  thread_id: string;
  parent_id: string | null;
  author: string | null;
  author_label: string | null;
  is_staff: boolean;
  endorsed: boolean;
  body_text: string | null;
  body_hash: string | null;
  created_at: string | null;
  raw: Record<string, unknown>;
  synced_at: string;
}

interface QaPairRow {
  thread_id: string;
  course_id: string;
  question_text: string;
  answer_text: string;
  resolution_text: string | null;
  answer_message_id: string | null;
  answer_selection: string;
  lang: string;
  content_hash: string;
  answered_at: string | null;
}

function uiStateFromEntry(entry: StoredThreadEntry): ThreadUiState {
  return {
    noAnswerNeeded: Boolean(entry.noAnswerNeeded),
    seenAt: entry.seenAt ?? null,
    isNew: Boolean(entry.isNew),
    isUpdated: Boolean(entry.isUpdated),
  };
}

function buildThreadContentRow(
  courseId: string,
  thread: ForumThread
): ThreadContentRow {
  const bodyText =
    stripNullBytes(toPlainText(thread.raw_body, thread.rendered_body)) ?? "";
  // Store the raw Open edX object without the hydrated comment tree — comments
  // live in the messages table, so we avoid duplicating (and bloating) them.
  const { comments: _comments, comments_error: _err, ...rawThread } = thread;
  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(
      JSON.stringify(rawThread as Record<string, unknown>).replace(
        /\u0000/g,
        ""
      )
    ) as Record<string, unknown>;
  } catch {
    raw = {
      id: thread.id,
      title: thread.title ?? null,
      comment_count: thread.comment_count ?? null,
    };
  }

  return {
    campus_thread_id: thread.id,
    course_id: courseId,
    title: nullable(thread.title),
    author: nullable(thread.author),
    author_label: nullable(thread.author_label),
    body_text: bodyText || null,
    body_hash: bodyText ? hashContent(bodyText) : null,
    op_is_staff: isStaffAuthor(thread.author_label),
    comment_count: thread.comment_count ?? null,
    created_at: nullable(thread.created_at),
    last_activity_at: nullable(threadActivityAt(thread)),
    raw,
    synced_at: new Date().toISOString(),
  };
}

function buildThreadRow(
  courseId: string,
  thread: ForumThread,
  ui: ThreadUiState
): ThreadRow {
  return {
    ...buildThreadContentRow(courseId, thread),
    no_answer_needed: ui.noAnswerNeeded,
    seen_at: nullable(ui.seenAt),
    is_new: ui.isNew,
    is_updated: ui.isUpdated,
  };
}

function buildMessageRows(thread: ForumThread): MessageRow[] {
  return flattenComments(thread.comments)
    .filter((comment) => Boolean(comment?.id?.trim()))
    .map((comment) => {
      const bodyText =
        stripNullBytes(toPlainText(comment.raw_body, comment.rendered_body)) ??
        "";
      // Keep raw small — full HTML forests blow past PostgREST body limits when
      // upserting a whole course's messages in one request.
      const slimRaw: Record<string, unknown> = {
        id: comment.id,
        parent_id: comment.parent_id ?? null,
        author: comment.author ?? null,
        author_label: comment.author_label ?? null,
        endorsed: Boolean(comment.endorsed),
        child_count: comment.child_count ?? 0,
        created_at: comment.created_at ?? null,
        raw_body: stripNullBytes(comment.raw_body ?? null),
      };
      return {
        campus_comment_id: comment.id.trim(),
        thread_id: thread.id,
        parent_id: nullable(comment.parent_id),
        author: nullable(comment.author),
        author_label: nullable(comment.author_label),
        is_staff: isStaffAuthor(comment.author_label),
        endorsed: Boolean(comment.endorsed),
        body_text: bodyText || null,
        body_hash: bodyText ? hashContent(bodyText) : null,
        created_at: nullable(comment.created_at),
        raw: slimRaw,
        synced_at: new Date().toISOString(),
      };
    });
}

/** Postgres ON CONFLICT rejects duplicate constrained keys in one INSERT. */
function dedupeMessageRows(rows: MessageRow[]): MessageRow[] {
  const byId = new Map<string, MessageRow>();
  for (const row of rows) {
    byId.set(row.campus_comment_id, row);
  }
  return [...byId.values()];
}

const MESSAGE_UPSERT_BATCH = 40;

async function upsertMessageBatches(
  rows: MessageRow[]
): Promise<{ error: unknown | null }> {
  const unique = dedupeMessageRows(rows);
  for (let i = 0; i < unique.length; i += MESSAGE_UPSERT_BATCH) {
    const chunk = unique.slice(i, i + MESSAGE_UPSERT_BATCH);
    const msgRes = await supabase!
      .from("messages")
      .upsert(chunk, { onConflict: "campus_comment_id" });
    if (msgRes.error) {
      return {
        error: {
          message: `${msgRes.error.message} (message batch ${i / MESSAGE_UPSERT_BATCH + 1}, ${chunk.length} rows)`,
          details: msgRes.error.details,
          hint: msgRes.error.hint,
          code: msgRes.error.code,
        },
      };
    }
  }
  return { error: null };
}

/**
 * Patch inbox UX flags on one thread row (אין צורך במענה / seen / חדש).
 * Fire-and-forget from the UI; never throws.
 *
 * When the threads row is missing, optionally upsert the full entry (with UI
 * flags) so the mark can still persist.
 */
export async function syncThreadUiStateToSupabase(
  threadId: string,
  ui: ThreadUiState,
  fallback?: {
    courseId: string;
    entry: StoredThreadEntry;
    lastCheckedAt?: string | null;
  }
): Promise<SyncResult> {
  if (!supabase) return { ok: false, skipped: true };

  try {
    const res = await supabase
      .from("threads")
      .update({
        no_answer_needed: ui.noAnswerNeeded,
        seen_at: nullable(ui.seenAt),
        is_new: ui.isNew,
        is_updated: ui.isUpdated,
      })
      .eq("campus_thread_id", threadId)
      .select("campus_thread_id");
    if (res.error) throw res.error;
    if (!res.data?.length) {
      if (fallback?.entry) {
        return syncCourseThreadsToSupabase(
          fallback.courseId,
          [fallback.entry],
          fallback.lastCheckedAt ?? null,
          { includeUiState: true }
        );
      }
      return {
        ok: false,
        message: `No threads row for ${threadId} — poll/sync the course first so UI flags can persist.`,
      };
    }
    return { ok: true, threads: 1 };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Supabase UI-state sync failed";
    return { ok: false, message };
  }
}

export interface SyncCourseOptions {
  /**
   * When true, also write `no_answer_needed` / seen / חדש on upsert.
   * Default false for polls so a stale localStorage cache cannot wipe DB marks.
   * Use true for first-time backfill from local → remote.
   */
  includeUiState?: boolean;
}

/**
 * Upsert one course's polled threads (+ messages + Q↔A pairs) into Supabase.
 * Returns a result object; never throws.
 *
 * By default **does not** overwrite shared UX flags on `threads` — those are
 * owned by `syncThreadUiStateToSupabase` / hydrate. Pass `includeUiState` when
 * backfilling an empty remote from localStorage.
 *
 * @param lastCheckedAt ISO watermark to store on `courses.last_checked_at`
 *   (drives incremental polls after hydrate-from-DB).
 */
export async function syncCourseThreadsToSupabase(
  courseId: string,
  entries: StoredThreadEntry[],
  lastCheckedAt?: string | null,
  options?: SyncCourseOptions
): Promise<SyncResult> {
  if (!supabase) return { ok: false, skipped: true };
  if (entries.length === 0 && !lastCheckedAt) {
    return { ok: true, threads: 0, messages: 0, qaPairs: 0 };
  }

  const includeUiState = options?.includeUiState === true;

  try {
    const course = findCourseById(courseId);
    const courseRow: CourseRow = {
      id: courseId,
      name: course?.name ?? courseId,
      name_he: nullable(course?.nameHe),
      forum_category: nullable(course?.forumCategory),
      ...(lastCheckedAt ? { last_checked_at: lastCheckedAt } : {}),
    };

    const threadRows: Array<ThreadContentRow | ThreadRow> = [];
    const messageRows: MessageRow[] = [];
    const qaRows: QaPairRow[] = [];
    const qaDeleteThreadIds: string[] = [];

    for (const entry of entries) {
      const thread = entry.thread;
      threadRows.push(
        includeUiState
          ? buildThreadRow(courseId, thread, uiStateFromEntry(entry))
          : buildThreadContentRow(courseId, thread)
      );
      messageRows.push(...buildMessageRows(thread));

      // Unknown comment forest: persist thread/messages, leave qa_pairs alone
      // so a failed hydrate never deletes a previously good pair.
      if (thread.comments_error) {
        continue;
      }

      const pair = buildQaPair(thread);
      if (pair) {
        qaRows.push({
          thread_id: pair.threadId,
          course_id: courseId,
          question_text: pair.questionText,
          answer_text: pair.answerText,
          resolution_text: pair.resolutionText || null,
          answer_message_id: pair.answerMessageId,
          answer_selection: pair.answerSelection,
          lang: pair.lang,
          content_hash: pair.contentHash,
          answered_at: pair.answeredAt,
        });
      } else {
        // Thread was processed but no longer qualifies — drop any stale pair.
        qaDeleteThreadIds.push(thread.id);
      }
    }

    // 1. Course (FK target for threads + qa_pairs).
    const courseRes = await supabase
      .from("courses")
      .upsert(courseRow, { onConflict: "id" });
    if (courseRes.error) {
      throw new Error(formatSyncError(courseRes.error, "courses"));
    }

    // 2. Threads (skip empty upsert — still allow watermark-only course update).
    //    Content-only upsert leaves no_answer_needed / seen columns untouched.
    if (threadRows.length > 0) {
      const threadRes = await supabase
        .from("threads")
        .upsert(threadRows, { onConflict: "campus_thread_id" });
      if (threadRes.error) {
        throw new Error(formatSyncError(threadRes.error, "threads"));
      }
    }

    // 3. Messages (before qa_pairs — answer_message_id references them).
    //    Batched + deduped: Postgres rejects ON CONFLICT when the same
    //    campus_comment_id appears twice in one INSERT (echoed replies).
    const uniqueMessages = dedupeMessageRows(messageRows);
    if (uniqueMessages.length > 0) {
      const msgRes = await upsertMessageBatches(uniqueMessages);
      if (msgRes.error) {
        throw new Error(formatSyncError(msgRes.error, "messages"));
      }
    } else {
      const expected = entries.filter(
        (e) =>
          (e.thread.comment_count ?? 0) > 1 &&
          (e.thread.comments?.length ?? 0) === 0
      ).length;
      if (expected > 0) {
        console.warn(
          `[tau-support] Supabase sync: ${expected} thread(s) still missing local replies — messages not written.`
        );
      }
    }

    // 4. Q↔A pairs (upsert qualifying, delete stale).
    //    Do not fail the whole sync if Q↔A write fails after messages succeeded.
    let qaPairsWritten = 0;
    let qaWarning: string | undefined;
    const uniqueQaRows = (() => {
      const byThread = new Map<string, QaPairRow>();
      for (const row of qaRows) byThread.set(row.thread_id, row);
      return [...byThread.values()];
    })();
    if (uniqueQaRows.length > 0) {
      const qaRes = await supabase
        .from("qa_pairs")
        .upsert(uniqueQaRows, { onConflict: "thread_id" });
      if (qaRes.error) {
        qaWarning = formatSyncError(qaRes.error, "qa_pairs");
        console.warn(`[tau-support] ${qaWarning}`);
      } else {
        qaPairsWritten = uniqueQaRows.length;
      }
    }
    if (qaDeleteThreadIds.length > 0) {
      const delRes = await supabase
        .from("qa_pairs")
        .delete()
        .in("thread_id", qaDeleteThreadIds);
      if (delRes.error) {
        const warning = formatSyncError(delRes.error, "qa_pairs.delete");
        qaWarning = qaWarning ? `${qaWarning}; ${warning}` : warning;
        console.warn(`[tau-support] ${warning}`);
      }
    }

    return {
      ok: true,
      threads: threadRows.length,
      messages: uniqueMessages.length,
      qaPairs: qaPairsWritten,
      message: qaWarning,
    };
  } catch (err) {
    return { ok: false, message: formatSyncError(err) };
  }
}
