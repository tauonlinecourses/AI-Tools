/**
 * Deterministic student-question ↔ staff-answer pairing for the RAG corpus.
 *
 * Campus IL / Open edX gives us a thread (the OP = question) plus a forest of
 * comments. Phase 1 turns each *answered* thread into a single plain-text Q↔A
 * pair, plus the RAG-readiness fields (`lang`, `content_hash`, `resolution_text`)
 * the future embedding worker relies on. All logic here is pure so it can be
 * unit-tested and reused by the Supabase sync.
 */

import type { ForumComment, ForumThread } from "./types";
import { isStaffAuthor } from "./unanswered";

export type AnswerSelection = "endorsed" | "first_staff";

export interface QaPair {
  threadId: string;
  questionText: string;
  answerText: string;
  resolutionText: string;
  answerMessageId: string | null;
  answerSelection: AnswerSelection;
  lang: string;
  contentHash: string;
  answeredAt: string | null;
}

/**
 * Strip HTML/markdown to readable plain text for storage + embedding.
 * Prefers the raw markdown body (closest to what the author typed) and falls
 * back to the rendered HTML. Not a full markdown parser — just enough to get
 * clean, embeddable prose.
 */
export function toPlainText(raw?: string, rendered?: string): string {
  let text = (raw ?? "").trim() || (rendered ?? "").trim();
  if (!text) return "";

  // Drop markdown reference-style image/link definitions: `[1]: http://...`
  text = text.replace(/^\s*\[\d+\]:\s*\S+.*$/gm, "");
  // Image markup → alt text (or nothing).
  text = text.replace(/!\[([^\]]*)\]\[[^\]]*\]/g, "$1");
  text = text.replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1");
  // Inline links `[label](url)` → label.
  text = text.replace(/\[([^\]]+)\]\([^)]*\)/g, "$1");
  // HTML block breaks → newlines before tag stripping.
  text = text.replace(/<\s*br\s*\/?\s*>/gi, "\n");
  text = text.replace(/<\/\s*(p|div|li|h[1-6])\s*>/gi, "\n");
  // Remove remaining HTML tags.
  text = text.replace(/<[^>]+>/g, "");
  // Decode the handful of entities we emit / commonly see.
  text = text
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");
  // Collapse excess whitespace.
  text = text.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n");
  return text.trim();
}

/** Detect the dominant language for embedding-model routing (Phase 2). */
export function detectLang(text: string): string {
  const hasHebrew = /[\u0590-\u05FF]/.test(text);
  const hasLatin = /[A-Za-z]/.test(text);
  if (hasHebrew && hasLatin) return "mixed";
  if (hasHebrew) return "he";
  if (hasLatin) return "en";
  return "unknown";
}

/**
 * Stable, synchronous content hash (FNV-1a, 32-bit, hex). Used only for change
 * detection so the Phase 2 embedding worker can skip unchanged rows — not for
 * security. Sync + dependency-free so it runs anywhere in the poll path.
 */
export function hashContent(text: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

/** Depth-first flatten of the comment forest, preserving document order. */
export function flattenComments(comments?: ForumComment[]): ForumComment[] {
  const out: ForumComment[] = [];
  const walk = (list?: ForumComment[]) => {
    for (const c of list ?? []) {
      out.push(c);
      if (c.children?.length) walk(c.children);
    }
  };
  walk(comments);
  return out;
}

function commentTimeMs(comment: ForumComment): number {
  const ms = Date.parse(comment.created_at ?? "");
  return Number.isNaN(ms) ? Number.POSITIVE_INFINITY : ms;
}

export interface SelectedStaffAnswer {
  comment: ForumComment;
  selection: AnswerSelection;
}

/**
 * Pick the staff reply that best represents the answer:
 *  1. endorsed staff comment (earliest created_at if several)
 *  2. else the earliest staff-labeled reply at any depth
 * Returns null when no staff reply exists.
 */
export function selectStaffAnswer(
  thread: ForumThread
): SelectedStaffAnswer | null {
  const staff = flattenComments(thread.comments).filter((c) =>
    isStaffAuthor(c.author_label)
  );
  if (staff.length === 0) return null;

  const endorsed = staff
    .filter((c) => c.endorsed)
    .sort((a, b) => commentTimeMs(a) - commentTimeMs(b));
  if (endorsed.length > 0) {
    return { comment: endorsed[0]!, selection: "endorsed" };
  }

  const earliest = [...staff].sort(
    (a, b) => commentTimeMs(a) - commentTimeMs(b)
  );
  return { comment: earliest[0]!, selection: "first_staff" };
}

function threadQuestionText(thread: ForumThread): string {
  const title = (thread.title ?? "").trim();
  const body = toPlainText(thread.raw_body, thread.rendered_body);
  return [title, body].filter(Boolean).join("\n\n").trim();
}

/**
 * Build the full-thread transcript used as parent context in Phase 2
 * (small-to-big retrieval): the question followed by every staff reply, in
 * chronological document order.
 */
function buildResolutionText(
  thread: ForumThread,
  questionText: string
): string {
  const staffReplies = flattenComments(thread.comments)
    .filter((c) => isStaffAuthor(c.author_label))
    .map((c) => toPlainText(c.raw_body, c.rendered_body))
    .filter(Boolean);

  const parts = [`שאלה:\n${questionText}`];
  staffReplies.forEach((reply, i) => {
    parts.push(`תשובת צוות ${i + 1}:\n${reply}`);
  });
  return parts.join("\n\n").trim();
}

/**
 * Produce a Q↔A pair for a thread, or null when it should not yield one:
 *  - staff-authored OP (not a student question)
 *  - no staff reply (unanswered / not yet resolved)
 *  - comment forest failed to load (unknown — don't fabricate a pair)
 */
export function buildQaPair(thread: ForumThread): QaPair | null {
  if (isStaffAuthor(thread.author_label)) return null;
  if (thread.comments_error) return null;

  const answer = selectStaffAnswer(thread);
  if (!answer) return null;

  const questionText = threadQuestionText(thread);
  const answerText = toPlainText(
    answer.comment.raw_body,
    answer.comment.rendered_body
  );
  if (!questionText || !answerText) return null;

  const resolutionText = buildResolutionText(thread, questionText);

  return {
    threadId: thread.id,
    questionText,
    answerText,
    resolutionText,
    answerMessageId: answer.comment.id ?? null,
    answerSelection: answer.selection,
    lang: detectLang(questionText),
    contentHash: hashContent(`${questionText}\n---\n${answerText}`),
    answeredAt: answer.comment.created_at ?? null,
  };
}
