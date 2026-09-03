import type { ForumComment, ForumThread } from "./types";

const STAFF_LABEL_PATTERNS = [
  /\bstaff\b/i,
  /\bcommunity\s*ta\b/i,
  /\bmoderator\b/i,
  /\binstructor\b/i,
  /\badministrator\b/i,
  /צוות/,
  /מרצה/,
  /מתרגל/,
  /מנחה/,
];

export function isStaffAuthor(label?: string | null): boolean {
  if (!label?.trim()) return false;
  return STAFF_LABEL_PATTERNS.some((pattern) => pattern.test(label));
}

function walkComments(
  comments: ForumComment[],
  visit: (comment: ForumComment) => boolean
): boolean {
  for (const comment of comments) {
    if (visit(comment)) return true;
    if (comment.children?.length && walkComments(comment.children, visit)) {
      return true;
    }
  }
  return false;
}

function hasStaffReply(thread: ForumThread): boolean {
  const comments = thread.comments ?? [];
  if (comments.length === 0) return false;
  return walkComments(comments, (comment) => isStaffAuthor(comment.author_label));
}

/**
 * Campus IL / Open edX `comment_count` includes the original post, so a thread
 * with no replies has comment_count === 1 (not 0).
 *
 * Unanswered = student/non-staff OP with no replies (count <= 1), or replies
 * loaded with no staff/TA reply. Staff/TA-authored threads never need an answer.
 * If replies exist but failed to load, returns false (unknown — do not count).
 */
export function threadNeedsAnswer(thread: ForumThread): boolean {
  if (isStaffAuthor(thread.author_label)) return false;

  const count = thread.comment_count ?? 0;
  // OP only (or empty) — no student/staff replies yet
  if (count <= 1) return true;

  const comments = thread.comments ?? [];
  if (comments.length === 0) {
    // Failed load or empty payload — treat as unknown
    return false;
  }

  return !hasStaffReply(thread);
}

export function countUnanswered(threads: ForumThread[]): number {
  return threads.filter(threadNeedsAnswer).length;
}
