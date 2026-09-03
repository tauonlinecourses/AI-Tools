/**
 * Browser-persisted forum thread inbox.
 * Campus IL remains the source of truth; this store keeps what we’ve already
 * fetched so reload / check-all can merge instead of replacing.
 */

import type { ForumThread } from "./types";

export const THREAD_STORE_KEY = "tau-support-thread-store-v1";
export const THREAD_STORE_VERSION = 1;
export const MAX_THREADS_PER_COURSE = 50;

export interface KnownThreadSnapshot {
  id: string;
  last_activity_at?: string;
  comment_count?: number;
}

export interface StoredThreadEntry {
  thread: ForumThread;
  fetchedAt: string;
  seenAt?: string | null;
  /** True until the user opens / dismisses the thread in the inbox. */
  isNew: boolean;
  /** True when an existing thread got newer activity (cleared with isNew). */
  isUpdated: boolean;
}

export interface CourseThreadBucket {
  lastCheckedAt: string | null;
  forumUiOrigin?: string;
  categoryName?: string;
  totalCount?: number | null;
  threads: Record<string, StoredThreadEntry>;
}

export interface ThreadStore {
  version: typeof THREAD_STORE_VERSION;
  courses: Record<string, CourseThreadBucket>;
}

export function emptyThreadStore(): ThreadStore {
  return { version: THREAD_STORE_VERSION, courses: {} };
}

export function threadActivityAt(thread: ForumThread): string | undefined {
  return (
    thread.last_activity_at ??
    thread.updated_at ??
    thread.modified_at ??
    thread.created_at
  );
}

export function activityTimestampMs(iso?: string | null): number {
  if (!iso) return 0;
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? 0 : ms;
}

function isThreadStore(value: unknown): value is ThreadStore {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return (
    record.version === THREAD_STORE_VERSION &&
    typeof record.courses === "object" &&
    record.courses !== null
  );
}

export function loadThreadStore(): ThreadStore {
  try {
    const raw = localStorage.getItem(THREAD_STORE_KEY);
    if (!raw) return emptyThreadStore();
    const parsed: unknown = JSON.parse(raw);
    if (!isThreadStore(parsed)) return emptyThreadStore();
    return parsed;
  } catch {
    return emptyThreadStore();
  }
}

export function saveThreadStore(store: ThreadStore): void {
  try {
    localStorage.setItem(THREAD_STORE_KEY, JSON.stringify(store));
  } catch {
    // ignore quota / private mode
  }
}

export function getCourseBucket(
  store: ThreadStore,
  courseId: string
): CourseThreadBucket {
  return (
    store.courses[courseId] ?? {
      lastCheckedAt: null,
      threads: {},
    }
  );
}

export function knownSnapshotsForCourse(
  store: ThreadStore,
  courseId: string
): KnownThreadSnapshot[] {
  const bucket = getCourseBucket(store, courseId);
  return Object.values(bucket.threads).map((entry) => ({
    id: entry.thread.id,
    last_activity_at: threadActivityAt(entry.thread),
    comment_count: entry.thread.comment_count,
  }));
}

function pruneCourseThreads(
  threads: Record<string, StoredThreadEntry>
): Record<string, StoredThreadEntry> {
  const entries = Object.values(threads).sort(
    (a, b) =>
      activityTimestampMs(threadActivityAt(b.thread)) -
      activityTimestampMs(threadActivityAt(a.thread))
  );

  if (entries.length <= MAX_THREADS_PER_COURSE) {
    return threads;
  }

  const kept = entries.slice(0, MAX_THREADS_PER_COURSE);
  const next: Record<string, StoredThreadEntry> = {};
  for (const entry of kept) {
    next[entry.thread.id] = entry;
  }
  return next;
}

export interface MergeCoursePollMeta {
  /** First seed for a course — do not flood “new” badges. */
  seed?: boolean;
  now?: string;
  forumUiOrigin?: string;
  categoryName?: string;
  totalCount?: number | null;
  /** Advance lastCheckedAt after a successful poll (default true). */
  advanceWatermark?: boolean;
}

/**
 * Upsert fetched threads into the course bucket.
 * - Unknown id → insert (isNew unless seed)
 * - Known id with newer activity / higher comment_count → update (isUpdated unless seed)
 * - Known id unchanged → keep existing comments if the fetch omitted them
 */
export function mergeCoursePoll(
  store: ThreadStore,
  courseId: string,
  fetched: ForumThread[],
  meta: MergeCoursePollMeta = {}
): ThreadStore {
  const now = meta.now ?? new Date().toISOString();
  const seed = meta.seed === true;
  const prev = getCourseBucket(store, courseId);
  const threads: Record<string, StoredThreadEntry> = { ...prev.threads };

  for (const incoming of fetched) {
    const existing = threads[incoming.id];
    const incomingActivity = threadActivityAt(incoming);
    const incomingActivityMs = activityTimestampMs(incomingActivity);
    const existingActivityMs = existing
      ? activityTimestampMs(threadActivityAt(existing.thread))
      : 0;
    const incomingCount = incoming.comment_count ?? 0;
    const existingCount = existing?.thread.comment_count ?? 0;
    const activityChanged =
      incomingActivityMs > existingActivityMs || incomingCount > existingCount;

    if (!existing) {
      threads[incoming.id] = {
        thread: incoming,
        fetchedAt: now,
        seenAt: seed ? now : null,
        isNew: !seed,
        isUpdated: false,
      };
      continue;
    }

    const mergedThread: ForumThread = {
      ...existing.thread,
      ...incoming,
      // Keep prior comments when the poll returned a summary without replies.
      comments:
        incoming.comments !== undefined
          ? incoming.comments
          : existing.thread.comments,
      comments_error:
        incoming.comments_error !== undefined
          ? incoming.comments_error
          : existing.thread.comments_error,
    };

    if (!activityChanged) {
      threads[incoming.id] = {
        ...existing,
        thread: mergedThread,
      };
      continue;
    }

    threads[incoming.id] = {
      thread: mergedThread,
      fetchedAt: now,
      seenAt: seed ? existing.seenAt ?? now : null,
      isNew: false,
      isUpdated: !seed,
    };
  }

  const advance = meta.advanceWatermark !== false;
  const nextBucket: CourseThreadBucket = {
    lastCheckedAt: advance ? now : prev.lastCheckedAt,
    forumUiOrigin: meta.forumUiOrigin ?? prev.forumUiOrigin,
    categoryName:
      meta.categoryName !== undefined ? meta.categoryName : prev.categoryName,
    totalCount:
      meta.totalCount !== undefined ? meta.totalCount : prev.totalCount,
    threads: pruneCourseThreads(threads),
  };

  return {
    ...store,
    courses: {
      ...store.courses,
      [courseId]: nextBucket,
    },
  };
}

export function markThreadSeen(
  store: ThreadStore,
  courseId: string,
  threadId: string,
  now = new Date().toISOString()
): ThreadStore {
  const bucket = getCourseBucket(store, courseId);
  const entry = bucket.threads[threadId];
  if (!entry || (!entry.isNew && !entry.isUpdated && entry.seenAt)) {
    return store;
  }

  return {
    ...store,
    courses: {
      ...store.courses,
      [courseId]: {
        ...bucket,
        threads: {
          ...bucket.threads,
          [threadId]: {
            ...entry,
            isNew: false,
            isUpdated: false,
            seenAt: now,
          },
        },
      },
    },
  };
}

export function markAllSeenForCourse(
  store: ThreadStore,
  courseId: string,
  now = new Date().toISOString()
): ThreadStore {
  const bucket = getCourseBucket(store, courseId);
  const threads: Record<string, StoredThreadEntry> = {};
  let changed = false;

  for (const [id, entry] of Object.entries(bucket.threads)) {
    if (entry.isNew || entry.isUpdated || !entry.seenAt) {
      changed = true;
      threads[id] = {
        ...entry,
        isNew: false,
        isUpdated: false,
        seenAt: now,
      };
    } else {
      threads[id] = entry;
    }
  }

  if (!changed) return store;

  return {
    ...store,
    courses: {
      ...store.courses,
      [courseId]: { ...bucket, threads },
    },
  };
}

export function sortedEntriesForCourse(
  store: ThreadStore,
  courseId: string
): StoredThreadEntry[] {
  const bucket = getCourseBucket(store, courseId);
  return Object.values(bucket.threads).sort(
    (a, b) =>
      activityTimestampMs(threadActivityAt(b.thread)) -
      activityTimestampMs(threadActivityAt(a.thread))
  );
}

export interface GlobalInboxItem {
  courseId: string;
  entry: StoredThreadEntry;
}

export function listGlobalInbox(store: ThreadStore): GlobalInboxItem[] {
  const items: GlobalInboxItem[] = [];
  for (const [courseId, bucket] of Object.entries(store.courses)) {
    for (const entry of Object.values(bucket.threads)) {
      items.push({ courseId, entry });
    }
  }
  return items.sort(
    (a, b) =>
      activityTimestampMs(threadActivityAt(b.entry.thread)) -
      activityTimestampMs(threadActivityAt(a.entry.thread))
  );
}

export function countNewAcrossStore(store: ThreadStore): number {
  let count = 0;
  for (const bucket of Object.values(store.courses)) {
    for (const entry of Object.values(bucket.threads)) {
      if (entry.isNew || entry.isUpdated) count += 1;
    }
  }
  return count;
}

export function countNewForCourse(
  store: ThreadStore,
  courseId: string
): number {
  const bucket = getCourseBucket(store, courseId);
  return Object.values(bucket.threads).filter(
    (entry) => entry.isNew || entry.isUpdated
  ).length;
}
