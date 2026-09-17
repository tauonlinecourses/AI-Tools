/**
 * Suggest example student questions (שאלות לדוגמה) for an info-doc topic.
 *
 * Uses the RAG corpus: retrieve similar past forum Q↔A for the topic text,
 * then ask /api/chat to propose short Hebrew phrasings suitable for embedding
 * as info_docs.common_questions.
 */

import { aiChat } from "@workspace/ai-client/client";
import { infoDocBodyPlainText } from "./infoDocHtml";
import { normalizeCommonQuestions } from "./infoDocs";
import { findSimilarQa } from "./kbSearch";

export const SUGGEST_QUESTIONS_COUNT = 5;
/** How many past forum questions to feed as phrasing inspiration. */
export const SUGGEST_RAG_CONTEXT_COUNT = 8;
export const SUGGEST_MIN_SIMILARITY = 0.35;
/** Cap body length sent to the model / used as the retrieval query. */
const BODY_CHARS_FOR_QUERY = 1200;
const BODY_CHARS_FOR_PROMPT = 4000;

export interface SuggestInfoDocQuestionsResult {
  ok: boolean;
  skipped?: boolean;
  message?: string;
  questions?: string[];
  /** How many similar forum Q↔A hits informed the suggestion. */
  ragHitCount?: number;
}

const SYSTEM_PROMPT = [
  "את/ה עוזר/ת של צוות תמיכה טכנית בקמפוס IL.",
  "המשימה: להציע שאלות לדוגמה שסטודנטים עשויים לשאול על נושא מסמך מידע שימושי.",
  "השאלות ישמשו לחיפוש דמיון (RAG) — לכן הן חייבות להיות בניסוח של שאלת סטודנט אמיתית.",
  "חוקים:",
  "1. כתוב/י בעברית בלבד.",
  "2. כל שאלה קצרה וברורה (משפט אחד), בגוף ראשון או כשאלה ישירה.",
  "3. הסתמך/י על תוכן המסמך ועל שאלות פורום דומות שסופקו — אל תמציא/י נושאים שלא מופיעים בהם.",
  "4. גוון/י ניסוחים (מילים שונות לאותו צורך), בלי כפילויות.",
  `5. החזר/י בדיוק JSON במבנה: {"questions":["..."]} עם ${SUGGEST_QUESTIONS_COUNT} שאלות.`,
  "6. בלי הסברים, בלי markdown, בלי טקסט מחוץ ל-JSON.",
].join("\n");

function buildRetrievalQuery(title: string, bodyPlain: string): string {
  const t = title.trim();
  const b = bodyPlain.trim().slice(0, BODY_CHARS_FOR_QUERY);
  if (t && b) return `${t}\n\n${b}`;
  return t || b;
}

function parseQuestionsJson(raw: string): string[] {
  const trimmed = raw.trim();
  const fence = /^```(?:json)?\s*([\s\S]*?)```$/i.exec(trimmed);
  const jsonText = fence ? fence[1]!.trim() : trimmed;

  try {
    const parsed = JSON.parse(jsonText) as { questions?: unknown };
    if (Array.isArray(parsed.questions)) {
      return parsed.questions
        .filter((q): q is string => typeof q === "string")
        .map((q) => q.trim())
        .filter(Boolean);
    }
  } catch {
    // Fall through to line-based recovery.
  }

  // Recovery: numbered / bulleted lines if the model ignored JSON.
  return trimmed
    .split("\n")
    .map((line) =>
      line
        .replace(/^```(?:json)?/i, "")
        .replace(/```$/i, "")
        .replace(/^\s*[-*•]\s+/, "")
        .replace(/^\s*\d+[.)]\s+/, "")
        .replace(/^["']|["']$/g, "")
        .trim()
    )
    .filter(
      (line) =>
        line.length > 0 &&
        !line.startsWith("{") &&
        !line.startsWith("}") &&
        !/^questions/i.test(line)
    );
}

/**
 * Suggest common_questions for an info-doc from title+body via RAG + chat.
 */
export async function suggestInfoDocQuestions(input: {
  title: string;
  body: string;
}): Promise<SuggestInfoDocQuestionsResult> {
  const title = input.title.trim();
  const bodyPlain = infoDocBodyPlainText(input.body).trim();
  if (!title && !bodyPlain) {
    return {
      ok: false,
      message: "יש למלא כותרת או תוכן לפני הצעת שאלות",
    };
  }

  const query = buildRetrievalQuery(title, bodyPlain);
  const search = await findSimilarQa(query, {
    matchCount: SUGGEST_RAG_CONTEXT_COUNT,
    matchThreshold: 0.25,
    filterSourceTypes: ["qa_pair"],
  });

  if (search.skipped) {
    return { ok: true, skipped: true };
  }
  if (!search.ok) {
    return {
      ok: false,
      message: search.message ?? "חיפוש שאלות דומות נכשל",
    };
  }

  const hits = (search.hits ?? []).filter(
    (h) => h.similarity >= SUGGEST_MIN_SIMILARITY
  );

  const similarQuestions = hits
    .map((h) => (h.questionTitle || h.questionSnippet).trim())
    .filter(Boolean)
    .slice(0, SUGGEST_RAG_CONTEXT_COUNT);

  const userMessage = [
    "נושא מסמך המידע:",
    title || "(ללא כותרת)",
    "",
    "תוכן המסמך:",
    bodyPlain.slice(0, BODY_CHARS_FOR_PROMPT) || "(ריק)",
    "",
    similarQuestions.length > 0
      ? [
          "שאלות סטודנטים דומות מהפורום (להשראת ניסוח בלבד):",
          ...similarQuestions.map((q, i) => `${i + 1}. ${q}`),
        ].join("\n")
      : "אין שאלות פורום דומות במאגר — הצע/י לפי תוכן המסמך בלבד.",
  ].join("\n");

  try {
    const raw = await aiChat({
      messages: [{ role: "user", content: userMessage }],
      systemPrompt: SYSTEM_PROMPT,
      temperature: 0.4,
      responseFormat: { type: "json_object" },
    });

    const questions = normalizeCommonQuestions(
      parseQuestionsJson(raw ?? "")
    ).slice(0, SUGGEST_QUESTIONS_COUNT);

    if (questions.length === 0) {
      return {
        ok: false,
        message: "לא התקבלו שאלות מוצעות — נסו שוב",
        ragHitCount: similarQuestions.length,
      };
    }

    return {
      ok: true,
      questions,
      ragHitCount: similarQuestions.length,
    };
  } catch (err) {
    return {
      ok: false,
      message:
        err instanceof Error ? err.message : "הצעת השאלות נכשלה",
      ragHitCount: similarQuestions.length,
    };
  }
}
