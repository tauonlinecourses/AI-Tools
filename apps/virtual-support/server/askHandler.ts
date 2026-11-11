/**
 * RAG Ask (Stage 1):
 *   rewrite follow-up → embed → hybrid search (vector + keyword, RRF)
 *   → rank pages → full page text as context → grounded Hebrew answer.
 */

import { handler as chatHandler } from "@workspace/ai-client/server";
import { createVsServiceClient } from "./vsSupabase.js";
import { EMBED_MODEL, embedTexts } from "./embedCore.js";
import { estimateCostUsd, type ModelUsage } from "./pricing.js";
import { htmlToPlainText } from "./docPlainText.js";
import {
  buildContext,
  extractKeywordTerms,
  rankPages,
  type ContextPage,
  type HybridHit,
  type RankedPage,
} from "./askRetrieval.js";
import {
  isRefusal,
  processCitations,
  REFUSAL_SENTENCE,
  stripCitationMarkers,
} from "./askCitations.js";

export type AskMessage = {
  role: "user" | "assistant";
  content: string;
};

export type AskSource = {
  documentId: string;
  title: string;
  folderName: string | null;
  excerpt: string;
  similarity: number;
};

export type AskResult = {
  /** Answer text; `[n]` markers refer to sources[n - 1]. */
  answer: string;
  sources: AskSource[];
  /**
   * true → answer has validated inline citations and sources are exactly the
   * cited pages (sources[0] = first cited, opened automatically by the UI).
   * false → refusal, no match, or the model did not cite (sources = all pages
   * sent, as a fallback; nothing opens automatically).
   */
  cited: boolean;
  /** ask_log row id, for 👍/👎. Missing when logging is off or failed. */
  logId?: string;
};

/** Chunks fetched from the hybrid search before grouping into pages. */
const MATCH_COUNT = 20;
/** Cosine similarity a chunk needs to count as relevant on meaning alone. */
const MATCH_THRESHOLD = 0.3;
/** Full pages sent to the model. */
const MAX_PAGES = 4;
const MAX_HISTORY = 12;
/** Per history message; keeps the whole payload under ai-client's 64k total. */
const MAX_HISTORY_CHARS = 3000;
/** ai-client allows 16k chars per message; leave headroom for wrapper text. */
const MAX_USER_MESSAGE_CHARS = 15_000;
const MAX_QUESTION_CHARS = 2000;
const ANSWER_MODEL = "gpt-4o";
const REWRITE_MODEL = "gpt-4o-mini";
/**
 * Low temperature so the same question gets the same answer/refusal
 * (the OpenAI default of 1.0 made borderline questions flip between runs).
 */
const ANSWER_TEMPERATURE = 0.1;
/**
 * Stored on every ask_log row. Bump when the prompt, models or retrieval
 * settings change, so logs/evals can be compared before vs after.
 */
export const PIPELINE_VERSION = "stage3-2026-11-05";
const REWRITE_TEMPERATURE = 0;

const NO_MATCH_ANSWER =
  "לא מצאתי מידע רלוונטי במאגר המסמכים לשאלה הזו. נסו לנסח מחדש, או בדקו שמסמך מתאים קיים במערכת.";

const SYSTEM_PROMPT = `אתה עוזר ידע של מחלקת התמיכה הטכנית בארגון.
ענה בעברית, בבהירות ובקיצור.
הסתמך רק על המסמכים שסופקו בהקשר. המסמכים ממוספרים: [מסמך 1], [מסמך 2] וכן הלאה.
כשהתשובה היא הליך או רשימת שלבים, צטט את השלבים כפי שהם מופיעים במסמך, בסדרם המקורי, בלי לקצר או לשנות ניסוח.

ציטוטים — חובה:
- בסוף כל משפט ובסוף כל שלב, כתוב בסוגריים מרובעים את מספר המסמך שממנו נלקח המידע, למשל: [1]
- אם המידע נלקח משני מסמכים, כתוב: [1][2]
- צטט רק מסמכים שבאמת השתמשת בהם.
- אל תכתוב את כותרות המסמכים או את המילה "מסמך" בתוך הטקסט — רק את המספר בסוגריים.

מתי לענות ומתי לסרב — חשוב:
- ברירת המחדל היא לענות. בדוק: האם אחד המסמכים מסביר איך לבצע את הפעולה המרכזית שבשאלה, באותה מערכת? אם כן — חובה לענות מהמסמך, גם אם בשאלה יש ניסוח אחר, מילה נרדפת, או פרט נוסף שהמסמך לא מזכיר במפורש (למשל "לקורס אחר", "למשתמש חדש").
- פרט בשאלה שלא מופיע במסמך אינו סיבה לסרב: ענה על מה שהמסמך מכסה עם ציטוטים, והוסף בסוף משפט אחד שמציין מה בדיוק לא מופיע במסמכים. אל תמציא את החלק החסר.
- הוסף משפט כזה רק על פרט שהמשתמש שאל עליו. אל תוסיף הערות על מקרים שהמשתמש לא שאל עליהם.
- מערכת או תוכנה אחרת מזו שבמסמך אינה פרט קטן: אל תעביר הליך ממערכת אחת לאחרת.
- סרב רק אם אף מסמך אינו מסביר את הפעולה או הנושא של השאלה. במקרה זה ענה במשפט הבא בלבד, בלי ציטוטים ובלי להמציא:
${REFUSAL_SENTENCE}`;

const REWRITE_PROMPT = `תפקידך לנסח מחדש שאלת המשך כשאלה עצמאית לחיפוש במאגר ידע של תמיכה טכנית.
השתמש בהיסטוריית השיחה כדי להשלים הקשר חסר (למשל "זה", "ואם זה לא עובד").
שמור מונחים מדויקים כפי שהם: שמות מערכות, קודי שגיאה, מילים באנגלית.
החזר רק את השאלה המנוסחת בעברית, בשורה אחת, בלי הסברים.
אם השאלה כבר עצמאית — החזר אותה כפי שהיא.`;

type ChatMessage = { role: "user" | "assistant"; content: string };

export type AskStage = "rewrite" | "embed" | "search" | "answer";

/** Timings and token usage collected while answering one question. */
export type AskTrace = {
  latencyMs: Partial<Record<AskStage, number>>;
  usage: ModelUsage[];
  /** Last stage that started; names the failing stage when an error is thrown. */
  stage: AskStage | "start";
};

export function newTrace(): AskTrace {
  return { latencyMs: {}, usage: [], stage: "start" };
}

/** Run `fn`, adding its duration to `trace.latencyMs[stage]`. */
async function timed<T>(
  trace: AskTrace | undefined,
  stage: AskStage,
  fn: () => Promise<T>
): Promise<T> {
  if (trace) trace.stage = stage;
  const started = Date.now();
  try {
    return await fn();
  } finally {
    if (trace) {
      trace.latencyMs[stage] = (trace.latencyMs[stage] ?? 0) + Date.now() - started;
    }
  }
}

async function callChat(
  messages: ChatMessage[],
  systemPrompt: string,
  model: string,
  temperature: number,
  trace?: AskTrace,
  stage: AskStage = "answer"
): Promise<string> {
  const webReq = new Request("http://localhost/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages, systemPrompt, model, temperature }),
  });

  const webRes = await chatHandler(webReq);
  const body = (await webRes.json().catch(() => null)) as {
    content?: string;
    usage?: { inputTokens?: number; outputTokens?: number } | null;
    error?: string;
  } | null;

  if (body?.usage && trace) {
    trace.usage.push({
      stage,
      model,
      inputTokens: body.usage.inputTokens ?? 0,
      outputTokens: body.usage.outputTokens ?? 0,
    });
  }
  if (!webRes.ok) {
    throw new Error(body?.error || `Chat failed (${webRes.status})`);
  }
  const content = (body?.content ?? "").trim();
  if (!content) throw new Error("Empty model response");
  return content;
}

function cleanHistory(history: AskMessage[] | undefined): ChatMessage[] {
  return (history ?? [])
    .filter(
      (m) =>
        (m.role === "user" || m.role === "assistant") &&
        typeof m.content === "string" &&
        m.content.trim()
    )
    .slice(-MAX_HISTORY)
    .map((m) => ({
      role: m.role,
      // Old answers' [n] refer to that turn's sources, not this turn's pages.
      content: (m.role === "assistant"
        ? stripCitationMarkers(m.content)
        : m.content
      ).slice(0, MAX_HISTORY_CHARS),
    }))
    .filter((m) => m.content.trim());
}

/**
 * Turn a follow-up into a standalone question for retrieval.
 * No history → no model call. Any failure → original question.
 */
export async function rewriteQuestion(
  question: string,
  history: ChatMessage[],
  trace?: AskTrace
): Promise<string> {
  if (history.length === 0) return question;
  const transcript = history
    .map((m) => `${m.role === "user" ? "משתמש" : "עוזר"}: ${m.content}`)
    .join("\n\n");
  try {
    const rewritten = await timed(trace, "rewrite", () =>
      callChat(
        [
          {
            role: "user",
            content: `היסטוריית השיחה:\n${transcript}\n\nשאלת ההמשך:\n${question}`,
          },
        ],
        REWRITE_PROMPT,
        REWRITE_MODEL,
        REWRITE_TEMPERATURE,
        trace,
        "rewrite"
      )
    );
    const line = rewritten.split("\n")[0]!.trim();
    return line && line.length <= MAX_QUESTION_CHARS ? line : question;
  } catch (err) {
    console.warn(
      JSON.stringify({
        event: "vs_rewrite_failed",
        message: err instanceof Error ? err.message : String(err),
      })
    );
    return question;
  }
}

export type RetrievedPage = RankedPage & ContextPage;

export type RetrievalResult = {
  searchQuery: string;
  keywordText: string;
  hits: HybridHit[];
  pages: RetrievedPage[];
};

/** Hybrid search + page ranking + full-page hydration. No answer model call. */
export async function retrieve(
  searchQuery: string,
  trace?: AskTrace
): Promise<RetrievalResult> {
  const client = createVsServiceClient();
  const keywords = extractKeywordTerms(searchQuery);
  const { embeddings, tokens } = await timed(trace, "embed", () =>
    embedTexts([searchQuery])
  );
  trace?.usage.push({
    stage: "embed",
    model: EMBED_MODEL,
    inputTokens: tokens,
    outputTokens: 0,
  });

  return timed(trace, "search", () =>
    searchAndHydrate(client, searchQuery, keywords, embeddings[0]!)
  );
}

/** Hybrid search RPC, page ranking, then load the full pages. */
async function searchAndHydrate(
  client: ReturnType<typeof createVsServiceClient>,
  searchQuery: string,
  keywords: ReturnType<typeof extractKeywordTerms>,
  embedding: number[]
): Promise<RetrievalResult> {
  const { data, error } = await client.rpc("match_doc_chunks_hybrid", {
    query_embedding: embedding,
    query_text: keywords.text,
    match_count: MATCH_COUNT,
  });
  if (error) throw new Error(error.message);

  const hits = (data ?? []) as HybridHit[];
  const ranked = rankPages(hits, keywords.groups, MATCH_THRESHOLD, MAX_PAGES);
  if (ranked.length === 0) {
    return { searchQuery, keywordText: keywords.text, hits, pages: [] };
  }

  const { data: docs, error: docsErr } = await client
    .from("documents")
    .select("id, title, body, folder_id")
    .in(
      "id",
      ranked.map((p) => p.documentId)
    );
  if (docsErr) throw new Error(docsErr.message);

  const folderIds = [
    ...new Set(
      (docs ?? [])
        .map((d) => d.folder_id as string | null)
        .filter((id): id is string => Boolean(id))
    ),
  ];
  const folderNameById = new Map<string, string>();
  if (folderIds.length > 0) {
    const { data: folders, error: foldersErr } = await client
      .from("folders")
      .select("id, name")
      .in("id", folderIds);
    if (foldersErr) throw new Error(foldersErr.message);
    for (const f of folders ?? []) {
      folderNameById.set(f.id as string, f.name as string);
    }
  }

  const docById = new Map((docs ?? []).map((d) => [d.id as string, d]));
  const pages: RetrievedPage[] = [];
  for (const rankedPage of ranked) {
    const doc = docById.get(rankedPage.documentId);
    if (!doc) continue; // deleted between search and hydrate
    const folderId = doc.folder_id as string | null;
    pages.push({
      ...rankedPage,
      title: (doc.title as string) || "ללא כותרת",
      folderName: folderId ? folderNameById.get(folderId) ?? null : null,
      text: htmlToPlainText((doc.body as string) ?? ""),
    });
  }

  return { searchQuery, keywordText: keywords.text, hits, pages };
}

export type AskOutcome = "answered" | "refused" | "no_match" | "uncited";

export type PageSent = {
  documentId: string;
  title: string;
  similarity: number;
  keywordRank: number;
  rrf: number;
};

/** Full result incl. diagnostics, used for logging and by the eval script. */
export type AskDetails = {
  result: AskResult;
  outcome: AskOutcome;
  question: string;
  searchQuery: string;
  pagesSent: PageSent[];
  /** Best chunk similarity among all search hits (even ones below the bar). */
  bestSimilarity: number | null;
};

function normalizeQuestion(question: string | undefined): string {
  return (question?.trim() ?? "").slice(0, MAX_QUESTION_CHARS);
}

export async function askDetailed(
  input: {
    question: string;
    history?: AskMessage[];
  },
  trace?: AskTrace
): Promise<AskDetails> {
  const question = normalizeQuestion(input.question);
  if (!question) {
    throw new Error("question is required");
  }

  const history = cleanHistory(input.history);
  const searchQuery = await rewriteQuestion(question, history, trace);
  const { pages, hits } = await retrieve(searchQuery, trace);
  const bestSimilarity =
    hits.length > 0 ? Math.max(...hits.map((h) => h.similarity)) : null;
  const base = { question, searchQuery, bestSimilarity };
  const noMatch: AskDetails = {
    ...base,
    result: { answer: NO_MATCH_ANSWER, sources: [], cited: false },
    outcome: "no_match",
    pagesSent: [],
  };

  if (pages.length === 0) return noMatch;

  const prefix = "הקשר ממסמכי הידע:\n\n";
  const suffix = `\n\n---\n\nשאלת המשתמש:\n${question}`;
  const budget = MAX_USER_MESSAGE_CHARS - prefix.length - suffix.length;
  const { block, included } = buildContext(pages, budget);
  if (included.length === 0) return noMatch;

  const pageById = new Map(pages.map((p) => [p.documentId, p]));
  const sentPages = included.map((p) => pageById.get(p.documentId)!);
  const sources: AskSource[] = sentPages.map((page) => ({
    documentId: page.documentId,
    title: page.title,
    folderName: page.folderName,
    excerpt: page.bestHit.content.slice(0, 400),
    similarity: page.bestSimilarity,
  }));
  const pagesSent: PageSent[] = sentPages.map((page) => ({
    documentId: page.documentId,
    title: page.title,
    similarity: page.bestSimilarity,
    keywordRank: page.bestHit.keyword_rank,
    rrf: page.bestRrf,
  }));

  const raw = await timed(trace, "answer", () =>
    callChat(
      [...history, { role: "user", content: prefix + block + suffix }],
      SYSTEM_PROMPT,
      ANSWER_MODEL,
      ANSWER_TEMPERATURE,
      trace,
      "answer"
    )
  );

  if (isRefusal(raw)) {
    return {
      ...base,
      pagesSent,
      outcome: "refused",
      result: { answer: stripCitationMarkers(raw), sources: [], cited: false },
    };
  }

  const { text, order } = processCitations(raw, sources.length);
  if (order.length === 0) {
    // Model answered without citing: keep the sent pages as a fallback list.
    console.warn(JSON.stringify({ event: "vs_answer_uncited" }));
    return {
      ...base,
      pagesSent,
      outcome: "uncited",
      result: { answer: text, sources, cited: false },
    };
  }

  return {
    ...base,
    pagesSent,
    outcome: "answered",
    result: {
      answer: text,
      sources: order.map((n) => sources[n - 1]!),
      cited: true,
    },
  };
}

/** ask_log metric columns (migration 004) from a finished or failed trace. */
export function traceColumns(trace: AskTrace, totalMs: number) {
  const sum = (items: ModelUsage[], key: "inputTokens" | "outputTokens") =>
    items.reduce((n, u) => n + u[key], 0);
  const chat = trace.usage.filter((u) => u.stage !== "embed");
  const embed = trace.usage.filter((u) => u.stage === "embed");
  return {
    latency_ms: { ...trace.latencyMs, total: totalMs },
    total_ms: totalMs,
    usage: trace.usage,
    input_tokens: sum(chat, "inputTokens"),
    output_tokens: sum(chat, "outputTokens"),
    embed_tokens: sum(embed, "inputTokens"),
    cost_usd: estimateCostUsd(trace.usage),
  };
}

type LogRow = {
  question: string;
  searchQuery: string;
  outcome: AskOutcome | "error";
  answer: string;
  pagesSent: PageSent[];
  citedDocumentIds: string[];
  bestSimilarity: number | null;
  errorMessage?: string;
};

function detailsToLogRow(details: AskDetails): LogRow {
  return {
    question: details.question,
    searchQuery: details.searchQuery,
    outcome: details.outcome,
    answer: details.result.answer,
    pagesSent: details.pagesSent,
    citedDocumentIds: details.result.cited
      ? details.result.sources.map((s) => s.documentId)
      : [],
    bestSimilarity: details.bestSimilarity,
  };
}

/** Insert one anonymous ask_log row. Returns its id, or null on failure. */
async function logAsk(
  row: LogRow,
  sessionId: string | undefined,
  trace: AskTrace,
  totalMs: number
): Promise<string | null> {
  try {
    const client = createVsServiceClient();
    const { data, error } = await client
      .from("ask_log")
      .insert({
        session_id: sessionId?.slice(0, 64) || null,
        pipeline_version: PIPELINE_VERSION,
        question: row.question,
        search_query: row.searchQuery,
        outcome: row.outcome,
        answer: row.answer,
        pages_sent: row.pagesSent,
        cited_document_ids: row.citedDocumentIds,
        best_similarity: row.bestSimilarity,
        error_message: row.errorMessage?.slice(0, 1000) ?? null,
        ...traceColumns(trace, totalMs),
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return (data?.id as string) ?? null;
  } catch (err) {
    console.warn(
      JSON.stringify({
        event: "vs_ask_log_failed",
        message: err instanceof Error ? err.message : String(err),
      })
    );
    return null;
  }
}

export async function runAsk(input: {
  question: string;
  history?: AskMessage[];
  /** Random per-chat id from the browser (anonymous). */
  sessionId?: string;
  /** false for eval/smoke runs so they do not fill the log. */
  log?: boolean;
}): Promise<AskResult> {
  const trace = newTrace();
  const started = Date.now();
  let details: AskDetails;
  try {
    details = await askDetailed(input, trace);
  } catch (err) {
    const question = normalizeQuestion(input.question);
    // Empty questions are bad input, not pipeline errors; do not log them.
    if (input.log !== false && question) {
      const message = err instanceof Error ? err.message : String(err);
      await logAsk(
        {
          question,
          searchQuery: question,
          outcome: "error",
          answer: "",
          pagesSent: [],
          citedDocumentIds: [],
          bestSimilarity: null,
          errorMessage: `${trace.stage}: ${message}`,
        },
        input.sessionId,
        trace,
        Date.now() - started
      );
    }
    throw err;
  }
  if (input.log === false) return details.result;
  const logId = await logAsk(
    detailsToLogRow(details),
    input.sessionId,
    trace,
    Date.now() - started
  );
  return logId ? { ...details.result, logId } : details.result;
}
