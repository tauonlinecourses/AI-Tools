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
import { infoDocBodyPlainText } from "./infoDocHtml";
import { findSimilarQa, threadQuestionText, type SimilarQaHit } from "./kbSearch";
import type { ForumThread } from "./types";

/** Minimum top-hit cosine similarity required to attempt a draft. */
export const DRAFT_MIN_SIMILARITY = 0.45;
/** How many past Q↔A pairs to feed as grounding context. */
export const DRAFT_CONTEXT_COUNT = 5;

/** Fixed refusal sentence the model is told to emit when context is thin. */
export const DRAFT_REFUSAL_SENTENCE =
  "אין לי מספיק מידע ממאגר התשובות כדי לנסח תשובה.";

/** Fixed greeting applied around every successful draft body. */
export const DRAFT_OPENING = ["שלום,", "תודה שפנית אלינו."].join("\n");

/** Fixed sign-off; placeholder is left for staff to replace with their name. */
export const DRAFT_SIGNEE_PLACEHOLDER = "[שם אחראי תמיכה]";

export const DRAFT_CLOSING = [
  "בהצלחה בהמשך הלמידה!",
  `${DRAFT_SIGNEE_PLACEHOLDER}, צוות מערכות למידה`,
].join("\n");

/** True while the draft still contains the signee placeholder (blocks copy). */
export function draftHasSigneePlaceholder(text: string): boolean {
  return text.includes(DRAFT_SIGNEE_PLACEHOLDER);
}

export interface DraftSource {
  id: string;
  threadId: string | null;
  courseName: string | null;
  similarity: number;
  answeredAt: string | null;
  questionSnippet: string;
  answerSnippet: string;
  questionTitle: string;
  questionBody: string;
  content: string;
  /** 'qa_pair' or 'info_doc'. */
  sourceType: "qa_pair" | "info_doc";
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
  "המשימה: לנסח את גוף תשובת התמיכה לשאלת סטודנט, בעברית.",
  "חוקים מחייבים:",
  "1. הסתמך/י אך ורק על תשובות הצוות הקודמות ועל מסמכי המידע השימושי שסופקו בהקשר. אין להשתמש בידע חיצוני.",
  "2. אין להמציא מדיניות, קישורים, שמות מערכות או שלבים שלא מופיעים בהקשר.",
  `3. אם ההקשר אינו מכסה את השאלה, השב/י בדיוק את המשפט: "${DRAFT_REFUSAL_SENTENCE}"`,
  "4. כתוב/כתבי בעברית, בקצרה וברור, בנימה של צוות תמיכה.",
  "5. עדיפות גבוהה למסמכי מידע שימושי: אם קיים מסמך מידע רלוונטי בהקשר, בסיס/י עליו קודם כמקור הרשמי. השתמשי בתשובות צוות קודמות רק להשלמה או ניסוח, ובמקרה של סתירה העדיפי תמיד את מסמך המידע השימושי.",
  "6. אם אין מסמך מידע וקיימות כמה תשובות צוות סותרות, העדף/י את התשובה עם התאריך החדש יותר.",
  "7. מבנה התשובה: חלק/י את גוף התשובה לפסקאות קצרות — רעיון אחד או שלב אחד בכל פסקה. הפרד/י בין פסקאות בשורה ריקה (שורה ריקה בין כל פסקה). אין לכתוב פסקה אחת ארוכה רצופה.",
  "8. כתוב/כתבי רק את גוף התשובה — בלי ברכת פתיחה (שלום / תודה שפנית) ובלי חתימה או איחולי הצלחה. המערכת תוסיף אותם אוטומטית.",
].join("\n");

/** Strip greetings/sign-offs the model may copy from retrieved staff answers. */
function stripEnvelope(text: string): string {
  let body = text.trim();
  body = body.replace(
    /^(?:שלום[^\n]*\n+)?(?:תודה שפנית[^\n]*\n+)+/u,
    ""
  );
  body = body.replace(
    /(?:\n+בהצלחה בהמשך הלמידה!?)+[\s\S]*$/u,
    ""
  );
  body = body.replace(
    /(?:\n+\[[^\]]*\][^\n]*צוות מערכות למידה[^\n]*)+\s*$/u,
    ""
  );
  return body.trim();
}

/** Decode common HTML entities the model sometimes copies from context. */
function decodeBasicEntities(text: string): string {
  return text
    .replace(/&nbsp;/gi, " ")
    .replace(/&ndash;/gi, "–")
    .replace(/&mdash;/gi, "—")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&amp;/gi, "&");
}

/**
 * Prefer blank lines between paragraphs. If the model used only single
 * newlines between long sentences, upgrade those to paragraph breaks.
 */
function normalizeParagraphSpacing(text: string): string {
  let body = text.replace(/\r\n/g, "\n").trim();
  if (!body) return body;

  // Already has blank-line paragraphs — just collapse excess blanks.
  if (/\n\s*\n/.test(body)) {
    return body.replace(/\n{3,}/g, "\n\n").trim();
  }

  // Single-newline block: treat each non-empty line as its own paragraph.
  const lines = body
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length >= 2) {
    return lines.join("\n\n");
  }

  // One long line: split after sentence-ending punctuation when a new
  // idea likely starts (Hebrew / Latin).
  body = body.replace(/([.!?…])\s+(?=[\u0590-\u05FF"“«A-Za-z0-9])/gu, "$1\n\n");
  return body.replace(/\n{3,}/g, "\n\n").trim();
}

/** Wrap grounded body with the fixed Campus IL support template. */
export function wrapDraftBody(body: string): string {
  const trimmed = normalizeParagraphSpacing(
    decodeBasicEntities(stripEnvelope(body))
  );
  return `${DRAFT_OPENING}\n\n${trimmed}\n\n${DRAFT_CLOSING}`;
}

/** Format ISO / timestamptz as DD.MM.YYYY for the prompt. */
function formatAnswerDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}.${mm}.${d.getFullYear()}`;
}

function buildContextBlock(hits: SimilarQaHit[]): string {
  // Official info docs first so the model sees them before past Q↔A.
  const ordered = [
    ...hits.filter((h) => h.sourceType === "info_doc"),
    ...hits.filter((h) => h.sourceType !== "info_doc"),
  ];

  return ordered
    .map((hit, i) => {
      const date = formatAnswerDate(hit.answeredAt);
      const meta = date
        ? `דמיון ${(hit.similarity * 100).toFixed(0)}%, עודכן ${date}`
        : `דמיון ${(hit.similarity * 100).toFixed(0)}%`;

      if (hit.sourceType === "info_doc") {
        const parts = [
          `מסמך מידע שימושי (מקור רשמי מועדף) ${i + 1} (${meta}):`,
          hit.questionSnippet || hit.questionTitle,
        ];
        if (hit.answerSnippet) {
          parts.push(`תוכן:`, infoDocBodyPlainText(hit.answerSnippet));
        }
        return parts.join("\n");
      }

      const parts = [
        `שאלה קודמת ${i + 1} (${meta}):`,
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
    // Search the full KB across all courses + info docs (not just this thread's course).
    matchCount: DRAFT_CONTEXT_COUNT,
    matchThreshold: 0.3,
    filterSourceTypes: ["qa_pair", "info_doc"],
  });

  if (search.skipped) return { ok: true, skipped: true };
  if (!search.ok) {
    return { ok: false, message: search.message ?? "Retrieval failed" };
  }

  const hits = search.hits ?? [];
  const maxSimilarity =
    hits.length > 0 ? Math.max(...hits.map((h) => h.similarity)) : 0;
  if (hits.length === 0 || maxSimilarity < DRAFT_MIN_SIMILARITY) {
    return { ok: true, refused: true };
  }

  // Prefer official info docs first in UI + prompt context.
  const orderedHits = [
    ...hits.filter((h) => h.sourceType === "info_doc"),
    ...hits.filter((h) => h.sourceType !== "info_doc"),
  ];

  const sources: DraftSource[] = orderedHits.map((hit) => ({
    id: hit.id,
    threadId: threadIdOf(hit),
    courseName: hit.courseName,
    similarity: hit.similarity,
    answeredAt: hit.answeredAt,
    questionSnippet: hit.questionSnippet,
    answerSnippet: hit.answerSnippet,
    questionTitle: hit.questionTitle,
    questionBody: hit.questionBody,
    content: hit.content,
    sourceType: hit.sourceType,
  }));

  const userMessage = [
    "שאלת הסטודנט:",
    question,
    "",
    "הקשר מהמאגר (מסמכי מידע שימושי קודם, ואז תשובות צוות קודמות):",
    buildContextBlock(orderedHits),
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

    return { ok: true, draft: wrapDraftBody(trimmed), sources };
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : "Draft generation failed",
    };
  }
}
