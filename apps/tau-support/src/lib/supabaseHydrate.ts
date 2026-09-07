/**
 * Load the forum inbox from the dedicated tau-support Supabase project.
 * Rebuilds ForumThread + comment forests from `threads` + `messages`.
 */

import { sanitizeCommentForest } from "./commentTree";
import { isSupabaseConfigured, supabase } from "./supabase";
import {
  MAX_THREADS_PER_COURSE,
  activityTimestampMs,
  threadActivityAt,
  type CourseThreadBucket,
  type StoredThreadEntry,
  type ThreadStore,
} from "./threadStore";
import type { ForumComment, ForumThread } from "./types";

export interface HydrateResult {
  ok: boolean;
  skipped?: boolean;
  message?: string;
  store?: ThreadStore;
  threadCount?: number;
}

interface ThreadDbRow {
  campus_thread_id: string;
  course_id: string;
  title: string | null;
  author: string | null;
  author_label: string | null;
  body_text: string | null;
  comment_count: number | null;
  created_at: string | null;
  last_activity_at: string | null;
  raw: Record<string, unknown> | null;
  synced_at: string;
}

interface MessageDbRow {
  campus_comment_id: string;
  thread_id: string;
  parent_id: string | null;
  author: string | null;
  author_label: string | null;
  endorsed: boolean;
  body_text: string | null;
  created_at: string | null;
  raw: Record<string, unknown> | null;
}

interface CourseDbRow {
  id: string;
  name_he: string | null;
  forum_category: string | null;
  last_checked_at: string | null;
}

function sortByCreated(a: ForumComment, b: ForumComment): number {
  return (
    activityTimestampMs(a.created_at) - activityTimestampMs(b.created_at)
  );
}

function buildCommentForest(flat: ForumComment[]): ForumComment[] {
  const byId = new Map<string, ForumComment>();
  for (const item of flat) {
    byId.set(item.id, { ...item, children: [] });
  }

  const roots: ForumComment[] = [];
  for (const item of byId.values()) {
    const parentId = item.parent_id;
    if (parentId && parentId === item.id) {
      roots.push(item);
      continue;
    }
    if (parentId && byId.has(parentId)) {
      const parent = byId.get(parentId)!;
      parent.children = parent.children ?? [];
      if (!parent.children.some((child) => child.id === item.id)) {
        parent.children.push(item);
      }
    } else if (!parentId) {
      roots.push(item);
    } else {
      // Orphan (parent missing) — still show as top-level.
      roots.push(item);
    }
  }

  return roots
    .map((root) => ({
      ...root,
      children: [...(root.children ?? [])].sort(sortByCreated),
    }))
    .sort(sortByCreated);
}

function messageToComment(row: MessageDbRow): ForumComment {
  const raw = (row.raw ?? {}) as Partial<ForumComment>;
  return {
    ...raw,
    id: row.campus_comment_id,
    parent_id: row.parent_id,
    author: row.author ?? raw.author,
    author_label: row.author_label ?? raw.author_label,
    endorsed: row.endorsed,
    created_at: row.created_at ?? raw.created_at,
    raw_body: raw.raw_body ?? row.body_text ?? undefined,
    rendered_body: raw.rendered_body,
    children: [],
  };
}

function threadRowToForumThread(
  row: ThreadDbRow,
  comments: ForumComment[]
): ForumThread {
  const raw = (row.raw ?? {}) as Partial<ForumThread>;
  return {
    ...raw,
    id: row.campus_thread_id,
    title: row.title ?? raw.title,
    author: row.author ?? raw.author,
    author_label: row.author_label ?? raw.author_label,
    created_at: row.created_at ?? raw.created_at,
    last_activity_at: row.last_activity_at ?? raw.last_activity_at,
    comment_count: row.comment_count ?? raw.comment_count,
    raw_body: raw.raw_body ?? row.body_text ?? undefined,
    rendered_body: raw.rendered_body,
    comments: sanitizeCommentForest(comments),
  };
}

function pruneToMax(
  threads: Record<string, StoredThreadEntry>
): Record<string, StoredThreadEntry> {
  const entries = Object.values(threads).sort(
    (a, b) =>
      activityTimestampMs(threadActivityAt(b.thread)) -
      activityTimestampMs(threadActivityAt(a.thread))
  );
  if (entries.length <= MAX_THREADS_PER_COURSE) return threads;
  const next: Record<string, StoredThreadEntry> = {};
  for (const entry of entries.slice(0, MAX_THREADS_PER_COURSE)) {
    next[entry.thread.id] = entry;
  }
  return next;
}

/**
 * Overlay local-only UX flags (seen / new / noAnswerNeeded) from a previous
 * localStorage store onto a freshly hydrated remote store.
 */
export function mergeLocalUiFlags(
  remote: ThreadStore,
  local: ThreadStore
): ThreadStore {
  const courses: ThreadStore["courses"] = {};
  for (const [courseId, bucket] of Object.entries(remote.courses)) {
    const localBucket = local.courses[courseId];
    const threads: CourseThreadBucket["threads"] = {};
    for (const [threadId, entry] of Object.entries(bucket.threads)) {
      const localEntry = localBucket?.threads[threadId];
      threads[threadId] = localEntry
        ? {
            ...entry,
            seenAt: localEntry.seenAt ?? entry.seenAt,
            isNew: localEntry.isNew,
            isUpdated: localEntry.isUpdated,
            noAnswerNeeded: localEntry.noAnswerNeeded,
          }
        : entry;
    }
    // Prefer remote watermark; fall back to local if column missing / null.
    // If still null but we have threads, use newest fetchedAt so the next poll
    // is incremental instead of a full seed.
    let lastCheckedAt =
      bucket.lastCheckedAt ?? localBucket?.lastCheckedAt ?? null;
    if (!lastCheckedAt) {
      let newest = 0;
      for (const entry of Object.values(threads)) {
        const ms = Date.parse(entry.fetchedAt);
        if (!Number.isNaN(ms) && ms > newest) newest = ms;
      }
      if (newest > 0) lastCheckedAt = new Date(newest).toISOString();
    }
    courses[courseId] = {
      ...bucket,
      lastCheckedAt,
      threads,
    };
  }
  return { version: remote.version, courses };
}

/**
 * Fetch all courses/threads/messages and build a ThreadStore.
 * Returns skipped when Supabase env is not configured.
 */
export async function hydrateThreadStoreFromSupabase(): Promise<HydrateResult> {
  if (!isSupabaseConfigured || !supabase) {
    return { ok: false, skipped: true };
  }

  try {
    const [coursesRes, threadsRes, messagesRes] = await Promise.all([
      supabase
        .from("courses")
        .select("id,name_he,forum_category,last_checked_at"),
      supabase.from("threads").select(
        "campus_thread_id,course_id,title,author,author_label,body_text,comment_count,created_at,last_activity_at,raw,synced_at"
      ),
      supabase.from("messages").select(
        "campus_comment_id,thread_id,parent_id,author,author_label,endorsed,body_text,created_at,raw"
      ),
    ]);

    if (coursesRes.error) throw coursesRes.error;
    if (threadsRes.error) throw threadsRes.error;
    if (messagesRes.error) throw messagesRes.error;

    const courseRows = (coursesRes.data ?? []) as CourseDbRow[];
    const threadRows = (threadsRes.data ?? []) as ThreadDbRow[];
    const messageRows = (messagesRes.data ?? []) as MessageDbRow[];

    const messagesByThread = new Map<string, MessageDbRow[]>();
    for (const msg of messageRows) {
      const list = messagesByThread.get(msg.thread_id) ?? [];
      list.push(msg);
      messagesByThread.set(msg.thread_id, list);
    }

    const courseMeta = new Map(courseRows.map((c) => [c.id, c]));
    const buckets = new Map<string, CourseThreadBucket>();

    const ensureBucket = (courseId: string): CourseThreadBucket => {
      let bucket = buckets.get(courseId);
      if (!bucket) {
        const meta = courseMeta.get(courseId);
        bucket = {
          lastCheckedAt: meta?.last_checked_at ?? null,
          categoryName: meta?.forum_category ?? undefined,
          forumUiOrigin: "https://app.campus.gov.il",
          threads: {},
        };
        buckets.set(courseId, bucket);
      }
      return bucket;
    };

    // Ensure course rows with watermarks exist even with zero threads.
    for (const course of courseRows) {
      ensureBucket(course.id);
    }

    const now = new Date().toISOString();
    for (const row of threadRows) {
      const bucket = ensureBucket(row.course_id);
      const flat = (messagesByThread.get(row.campus_thread_id) ?? []).map(
        messageToComment
      );
      const thread = threadRowToForumThread(row, buildCommentForest(flat));
      bucket.threads[row.campus_thread_id] = {
        thread,
        fetchedAt: row.synced_at || now,
        seenAt: now,
        isNew: false,
        isUpdated: false,
        noAnswerNeeded: false,
      };
    }

    const courses: ThreadStore["courses"] = {};
    for (const [courseId, bucket] of buckets.entries()) {
      courses[courseId] = {
        ...bucket,
        threads: pruneToMax(bucket.threads),
      };
    }

    const store: ThreadStore = { version: 1, courses };
    const threadCount = threadRows.length;
    return { ok: true, store, threadCount };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to hydrate from Supabase";
    return { ok: false, message };
  }
}
