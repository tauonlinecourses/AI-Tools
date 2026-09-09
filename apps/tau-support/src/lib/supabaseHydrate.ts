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
import { ensureStaffAuthorLabel, isStaffAuthor } from "./unanswered";

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
  no_answer_needed: boolean | null;
  seen_at: string | null;
  is_new: boolean | null;
  is_updated: boolean | null;
}

interface MessageDbRow {
  campus_comment_id: string;
  thread_id: string;
  parent_id: string | null;
  author: string | null;
  author_label: string | null;
  is_staff: boolean | null;
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
  let authorLabel = row.author_label ?? raw.author_label ?? null;
  // Manual סמן כצוות persists as messages.is_staff even when Campus IL
  // never sent a staff role label.
  if (row.is_staff && !isStaffAuthor(authorLabel)) {
    authorLabel = ensureStaffAuthorLabel(authorLabel);
  }
  return {
    ...raw,
    id: row.campus_comment_id,
    parent_id: row.parent_id,
    author: row.author ?? raw.author,
    author_label: authorLabel,
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
 * Merge local cache onto remote: DB owns shared UX flags.
 * Prefer remote `noAnswerNeeded` / seen / חדש; local may fill only when remote
 * still has all-default UI state (one-time migration from older local caches).
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
      if (!localEntry) {
        threads[threadId] = entry;
        continue;
      }
      const remoteHasUiState =
        Boolean(entry.noAnswerNeeded) ||
        entry.seenAt != null ||
        entry.isNew ||
        entry.isUpdated;
      threads[threadId] = remoteHasUiState
        ? {
            ...entry,
            // Remote true always wins; OR local only if remote is still false
            // (covers DB default before a local mark was pushed up).
            noAnswerNeeded: Boolean(
              entry.noAnswerNeeded || localEntry.noAnswerNeeded
            ),
          }
        : {
            ...entry,
            seenAt: localEntry.seenAt ?? entry.seenAt,
            isNew: localEntry.isNew,
            isUpdated: localEntry.isUpdated,
            noAnswerNeeded: Boolean(
              entry.noAnswerNeeded || localEntry.noAnswerNeeded
            ),
          };
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
 * Pull only shared UX flags from Supabase and overlay onto an existing store.
 * Used after load and on window focus so localhost picks up marks made elsewhere.
 *
 * Does **not** clobber a local `noAnswerNeeded: true` with a remote `false` —
 * that usually means the push had not landed yet (or failed). Those threads are
 * returned in `needsRepush` so the caller can re-sync.
 */
export async function applyRemoteUiFlagsToStore(
  store: ThreadStore,
  options?: {
    /** Thread ids with an in-flight local UI-flag write — skip remote overlay. */
    pendingThreadIds?: ReadonlySet<string>;
  }
): Promise<{
  ok: boolean;
  store: ThreadStore;
  marked?: number;
  message?: string;
  needsRepush?: Array<{
    courseId: string;
    threadId: string;
    noAnswerNeeded: boolean;
    seenAt: string | null;
    isNew: boolean;
    isUpdated: boolean;
  }>;
}> {
  if (!isSupabaseConfigured || !supabase) {
    return { ok: false, store, message: "Supabase not configured" };
  }

  try {
    const res = await supabase
      .from("threads")
      .select(
        "campus_thread_id,course_id,no_answer_needed,seen_at,is_new,is_updated"
      );
    if (res.error) throw res.error;

    const rows = (res.data ?? []) as Array<{
      campus_thread_id: string;
      course_id: string;
      no_answer_needed: boolean | null;
      seen_at: string | null;
      is_new: boolean | null;
      is_updated: boolean | null;
    }>;

    let marked = 0;
    let changed = false;
    const courses: ThreadStore["courses"] = { ...store.courses };
    const needsRepush: Array<{
      courseId: string;
      threadId: string;
      noAnswerNeeded: boolean;
      seenAt: string | null;
      isNew: boolean;
      isUpdated: boolean;
    }> = [];
    const pending = options?.pendingThreadIds;

    for (const row of rows) {
      const bucket = courses[row.course_id];
      if (!bucket) continue;
      const entry = bucket.threads[row.campus_thread_id];
      if (!entry) continue;

      if (pending?.has(row.campus_thread_id)) {
        if (entry.noAnswerNeeded) marked += 1;
        continue;
      }

      const remoteNoAnswerNeeded = Boolean(row.no_answer_needed);
      const localNoAnswerNeeded = Boolean(entry.noAnswerNeeded);
      // Keep a local mark if remote still says false (failed / lagging push).
      const noAnswerNeeded = remoteNoAnswerNeeded || localNoAnswerNeeded;
      if (localNoAnswerNeeded && !remoteNoAnswerNeeded) {
        needsRepush.push({
          courseId: row.course_id,
          threadId: row.campus_thread_id,
          noAnswerNeeded: true,
          seenAt: entry.seenAt ?? null,
          isNew: Boolean(entry.isNew),
          isUpdated: Boolean(entry.isUpdated),
        });
      }

      // Prefer remote new/updated flags, but don't revive "חדש" on a locally
      // handled (אין צורך במענה) thread when we're preserving that mark.
      const resolvedIsNew =
        localNoAnswerNeeded && !remoteNoAnswerNeeded
          ? Boolean(entry.isNew)
          : Boolean(row.is_new);
      const resolvedIsUpdated =
        localNoAnswerNeeded && !remoteNoAnswerNeeded
          ? Boolean(entry.isUpdated)
          : Boolean(row.is_updated);
      const resolvedSeenAt =
        localNoAnswerNeeded && !remoteNoAnswerNeeded
          ? (entry.seenAt ?? row.seen_at ?? null)
          : (row.seen_at ?? null);

      if (noAnswerNeeded) marked += 1;

      if (
        Boolean(entry.noAnswerNeeded) === noAnswerNeeded &&
        (entry.seenAt ?? null) === resolvedSeenAt &&
        Boolean(entry.isNew) === resolvedIsNew &&
        Boolean(entry.isUpdated) === resolvedIsUpdated
      ) {
        continue;
      }

      changed = true;
      const latestBucket = courses[row.course_id]!;
      courses[row.course_id] = {
        ...latestBucket,
        threads: {
          ...latestBucket.threads,
          [row.campus_thread_id]: {
            ...entry,
            noAnswerNeeded,
            seenAt: resolvedSeenAt,
            isNew: resolvedIsNew,
            isUpdated: resolvedIsUpdated,
          },
        },
      };
    }

    return {
      ok: true,
      store: changed ? { ...store, courses } : store,
      marked,
      needsRepush: needsRepush.length > 0 ? needsRepush : undefined,
    };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to refresh UI flags";
    return { ok: false, store, message };
  }
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
        "campus_thread_id,course_id,title,author,author_label,body_text,comment_count,created_at,last_activity_at,raw,synced_at,no_answer_needed,seen_at,is_new,is_updated"
      ),
      supabase.from("messages").select(
        "campus_comment_id,thread_id,parent_id,author,author_label,is_staff,endorsed,body_text,created_at,raw"
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
        seenAt: row.seen_at ?? null,
        isNew: Boolean(row.is_new),
        isUpdated: Boolean(row.is_updated),
        noAnswerNeeded: Boolean(row.no_answer_needed),
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
