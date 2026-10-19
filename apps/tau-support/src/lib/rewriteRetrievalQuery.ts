/**
 * AI rewrite of a student message into a short FAQ-shaped retrieval query.
 * Used before RAG embedding so email/narrative pastes match common_questions.
 * Falls back silently (returns null) if /api/chat fails — callers keep regex cleanup.
 */

/** Cap paste length sent to the rewrite model. */
const MAX_REWRITE_INPUT_CHARS = 2500;

type ChatOptions = Parameters<
  typeof import("@workspace/ai-client/client").aiChat
>[0];

/**
 * Browser: `/api/chat` via ai-client (Platform JWT).
 * Server (tau-data BFF): call the OpenAI handler directly — no bearer token
 * on the server, and auth already ran at the `/api/tau-data` gate.
 */
async function aiChat(options: ChatOptions): Promise<string> {
  if (typeof window === "undefined") {
    const { handler } = await import("@workspace/ai-client/server");
    const webRes = await handler(
      new Request("http://local/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(options),
      })
    );
    if (!webRes.ok) {
      const error = await webRes.text().catch(() => webRes.statusText);
      throw new Error(`AI request failed (${webRes.status}): ${error}`);
    }
    const data = (await webRes.json()) as { content?: string };
    return data.content ?? "";
  }
  const mod = await import("@workspace/ai-client/client");
  return mod.aiChat(options);
}

const SYSTEM_PROMPT = [
  "את/ה מסייע/ת לחיפוש במאגר תמיכה טכנית של קמפוס IL.",
  "המשימה: להפוך הודעת סטודנט (מייל / פורום / הדבקה חופשית) לשאלת חיפוש קצרה בעברית.",
  "השאלה תשמש להטמעה ולחיפוש דמיון מול שאלות לדוגמה במסמכי מידע ומול שאלות פורום.",
  "חוקים מחייבים:",
  "1. החזר/י משפט אחד בלבד (לכל היותר שניים קצרים), בניסוח של שאלת סטודנט (למה / איך / מה / מדוע).",
  "2. הסר/י ברכות, שמות, מספרי טלפון, כתובות מייל, חתימות ותודות.",
  "3. השאר/י רק את הבעיה הטכנית המרכזית — בלי סיפור רקע מיותר.",
  "4. אל תמציא/י פרטים שלא מופיעים בהודעה. אל תענה על השאלה.",
  "5. אם יש אחוז התקדמות / וי ירוק / השלמת קורס — נסח/י סביב זה כשאלה כללית (למשל למה לא 100%).",
  "6. החזר/י רק את טקסט השאלה המנוקה — בלי מרכאות, בלי JSON, בלי הסברים, בלי קידומת.",
].join("\n");

function sanitizeRewrittenQuery(raw: string): string | null {
  let t = (raw ?? "").trim();
  if (!t) return null;

  // Drop accidental markdown / quotes / labels the model may add.
  t = t.replace(/^```(?:\w+)?\s*/i, "").replace(/\s*```$/i, "");
  t = t.replace(/^["'«»]+|["'«»]+$/g, "").trim();
  t = t.replace(/^(?:שאלה(?:\s*מנוקה)?|query)\s*[:：-]\s*/i, "").trim();
  t = t.replace(/\s+/g, " ").trim();

  // Reject if the model clearly answered instead of rewriting.
  if (t.length < 8 || t.length > 280) return null;
  if (/^(שלום|תודה שפנית)/u.test(t)) return null;

  return t;
}

/**
 * Rewrite a full student message into one short Hebrew search question.
 * Returns null on empty input or any failure (never throws).
 */
export async function rewriteQuestionForRetrieval(
  questionText: string
): Promise<string | null> {
  const input = questionText.replace(/\s+/g, " ").trim();
  if (!input) return null;

  // Already short and question-shaped — skip the model call.
  if (
    input.length <= 120 &&
    /[?؟]|^(?:למה|מדוע|איך|כיצד|מה|האם)\b/u.test(input)
  ) {
    return input;
  }

  const clipped =
    input.length > MAX_REWRITE_INPUT_CHARS
      ? input.slice(0, MAX_REWRITE_INPUT_CHARS)
      : input;

  try {
    const raw = await aiChat({
      messages: [
        {
          role: "user",
          content: ["הודעת הסטודנט:", clipped].join("\n"),
        },
      ],
      systemPrompt: SYSTEM_PROMPT,
      temperature: 0.1,
    });
    return sanitizeRewrittenQuery(raw ?? "");
  } catch {
    return null;
  }
}
