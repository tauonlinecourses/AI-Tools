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

import type { StoredThreadEntry } from "./threadStore";
import { findCourseById } from "./courses";
import { buildQaPair, flattenComments, hashContent, toPlainText } from "./qaPairing";
import { supabase } from "./supabase";
import {
  threadActivityAt,
  type StoredThreadEntry,
} from "./threadStore";
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
  const bodyText = toPlainText(thread.raw_body, thread.rendered_body);
  // Store the raw Open edX object without the hydrated comment tree — comments
  // live in the messages table, so we avoid duplicating (and bloating) them.
  const { comments: _comments, comments_error: _err, ...rawThread } = thread;

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
    raw: rawThread as Record<string, unknown>,
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
  return flattenComments(thread.comments).map((comment) => {
    const bodyText = toPlainText(comment.raw_body, comment.rendered_body);
    const { children: _children, ...rawComment } = comment;
    return {
      campus_comment_id: comment.id,
      thread_id: thread.id,
      parent_id: nullable(comment.parent_id),
      author: nullable(comment.author),
      author_label: nullable(comment.author_label),
      is_staff: isStaffAuthor(comment.author_label),
      endorsed: Boolean(comment.endorsed),
      body_text: bodyText || null,
      body_hash: bodyText ? hashContent(bodyText) : null,
      created_at: nullable(comment.created_at),
      raw: rawComment as Record<string, unknown>,
      synced_at: new Date().toISOString(),
    };
  });
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
    if (courseRes.error) throw courseRes.error;

    // 2. Threads (skip empty upsert — still allow watermark-only course update).
    //    Content-only upsert leaves no_answer_needed / seen columns untouched.
    if (threadRows.length > 0) {
      const threadRes = await supabase
        .from("threads")
        .upsert(threadRows, { onConflict: "campus_thread_id" });
      if (threadRes.error) throw threadRes.error;
    }

    // 3. Messages (before qa_pairs — answer_message_id references them).
    if (messageRows.length > 0) {
      const msgRes = await supabase
        .from("messages")
        .upsert(messageRows, { onConflict: "campus_comment_id" });
      if (msgRes.error) throw msgRes.error;
    }

    // 4. Q↔A pairs (upsert qualifying, delete stale).
    if (qaRows.length > 0) {
      const qaRes = await supabase
        .from("qa_pairs")
        .upsert(qaRows, { onConflict: "thread_id" });
      if (qaRes.error) throw qaRes.error;
    }
    if (qaDeleteThreadIds.length > 0) {
      const delRes = await supabase
        .from("qa_pairs")
        .delete()
        .in("thread_id", qaDeleteThreadIds);
      if (delRes.error) throw delRes.error;
    }

    return {
      ok: true,
      threads: threadRows.length,
      messages: messageRows.length,
      qaPairs: qaRows.length,
    };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Supabase sync failed";
    return { ok: false, message };
  }
}
