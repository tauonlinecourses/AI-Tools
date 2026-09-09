/**
 * Phase 3: grounded draft answers.
 *
 * For an unanswered thread, retrieve the most similar past Q↔A from kb_chunks
 * and have the chat model write an editable Hebrew draft STRICTLY from that
 * context. If nothing clears the confidence gate, refuse (no model call).
 *
 * Reuses the existing secure /api/chat endpoint (server holds OPENAI_API_KEY).
 * Never throws — returns a result the UI renders.
 */

import { aiChat } from "@workspace/ai-client/client";
import { findSimilarQa, threadQuestionText, type SimilarQaHit } from "./kbSearch";
import type { ForumThread } from "./types";

/** Minimum top-hit cosine similarity required to attempt a draft. */
export const DRAFT_MIN_SIMILARITY = 0.45;
/** How many past Q↔A pairs to feed as grounding context. */
export const DRAFT_CONTEXT_COUNT = 5;

/** Fixed refusal sentence the model is told to emit when context is thin. */
export const DRAFT_REFUSAL_SENTENCE =
  "אין לי מספיק מידע ממאגר התשובות כדי לנסח תשובה.";

export interface DraftSource {
  id: string;
  threadId: string | null;
  courseName: string | null;
  similarity: number;
  questionSnippet: string;
  answerSnippet: string;
  questionTitle: string;
  questionBody: string;
  content: string;
}

export interface DraftResult {
  ok: boolean;
  /** True when Supabase / retrieval isn't available — not an error. */
  skipped?: boolean;
  /** True when no retrieved match cleared the confidence gate. */
  refused?: boolean;
  draft?: string;
  sources?: DraftSource[];
  message?: string;
}

const SYSTEM_PROMPT = [
  "את/ה עוזר/ת תמיכה טכנית של קמפוס IL (Campus IL).",
  "המשימה: לנסח טיוטת תשובה לשאלת סטודנט, בעברית, בגוף התשובה בלבד.",
  "חוקים מחייבים:",
  "1. הסתמך/י אך ורק על תשובות הצוות הקודמות שסופקו בהקשר. אין להשתמש בידע חיצוני.",
  "2. אין להמציא מדיניות, קישורים, שמות מערכות או שלבים שלא מופיעים בהקשר.",
  `3. אם ההקשר אינו מכסה את השאלה, השב/י בדיוק את המשפט: "${DRAFT_REFUSAL_SENTENCE}"`,
  "4. כתוב/כתבי בעברית, בקצרה וברור, בנימה של צוות תמיכה.",
].join("\n");

function buildContextBlock(hits: SimilarQaHit[]): string {
  return hits
    .map((hit, i) => {
      const parts = [
        `שאלה קודמת ${i + 1} (דמיון ${(hit.similarity * 100).toFixed(0)}%):`,
        hit.questionSnippet,
      ];
      if (hit.answerSnippet) {
        parts.push(`תשובת צוות ${i + 1}:`, hit.answerSnippet);
      }
      return parts.join("\n");
    })
    .join("\n\n---\n\n");
}

function threadIdOf(hit: SimilarQaHit): string | null {
  const raw = hit.metadata?.["thread_id"];
  return typeof raw === "string" ? raw : null;
}

/**
 * Retrieve similar past Q↔A, gate on confidence, and generate a grounded
 * draft. Returns `{ refused: true }` when nothing is similar enough.
 */
export async function draftAnswerForThread(
  thread: ForumThread
): Promise<DraftResult> {
  const question = threadQuestionText(thread);
  if (!question) {
    return { ok: false, message: "Empty question text" };
  }

  const search = await findSimilarQa(question, {
    // Search the full KB across all courses (not just this thread's course).
    matchCount: DRAFT_CONTEXT_COUNT,
    matchThreshold: 0.3,
  });

  if (search.skipped) return { ok: true, skipped: true };
  if (!search.ok) {
    return { ok: false, message: search.message ?? "Retrieval failed" };
  }

  const hits = search.hits ?? [];
  const top = hits[0];
  if (!top || top.similarity < DRAFT_MIN_SIMILARITY) {
    return { ok: true, refused: true };
  }

  const sources: DraftSource[] = hits.map((hit) => ({
    id: hit.id,
    threadId: threadIdOf(hit),
    courseName: hit.courseName,
    similarity: hit.similarity,
    questionSnippet: hit.questionSnippet,
    answerSnippet: hit.answerSnippet,
    questionTitle: hit.questionTitle,
    questionBody: hit.questionBody,
    content: hit.content,
  }));

  const userMessage = [
    "שאלת הסטודנט:",
    question,
    "",
    "תשובות צוות קודמות מהמאגר (הקשר):",
    buildContextBlock(hits),
  ].join("\n");

  try {
    const draft = await aiChat({
      messages: [{ role: "user", content: userMessage }],
      systemPrompt: SYSTEM_PROMPT,
      temperature: 0.2,
    });

    const trimmed = (draft ?? "").trim();
    if (!trimmed || trimmed === DRAFT_REFUSAL_SENTENCE) {
      return { ok: true, refused: true, sources };
    }

    return { ok: true, draft: trimmed, sources };
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : "Draft generation failed",
    };
  }
}
