/**
 * RAG Ask (Stage 1):
 *   rewrite follow-up → embed → hybrid search (vector + keyword, RRF)
 *   → rank pages → full page text as context → grounded Hebrew answer.
 */

import { handler as chatHandler } from "@workspace/ai-client/server";
import { createVsServiceClient } from "./vsSupabase.js";
import { embedTexts } from "./embedCore.js";
import { htmlToPlainText } from "./docPlainText.js";
import {
  buildContext,
  extractKeywordTerms,
  rankPages,
  type ContextPage,
  type HybridHit,
  type RankedPage,
} from "./askRetrieval.js";

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
  answer: string;
  sources: AskSource[];
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

const NO_MATCH_ANSWER =
  "לא מצאתי מידע רלוונטי במאגר המסמכים לשאלה הזו. נסו לנסח מחדש, או בדקו שמסמך מתאים קיים במערכת.";

const SYSTEM_PROMPT = `אתה עוזר ידע של מחלקת התמיכה הטכנית בארגון.
ענה בעברית, בבהירות ובקיצור.
הסתמך רק על המסמכים שסופקו בהקשר.
אם המסמכים אינם מכסים את השאלה — אמור במפורש שאין מספיק מידע במאגר הידע, ואל תמציא.
כשהתשובה היא הליך או רשימת שלבים, צטט את השלבים כפי שהם מופיעים במסמך, בסדרם המקורי, בלי לקצר או לשנות ניסוח.
כשאתה משתמש במסמך, ציין את כותרתו.`;

const REWRITE_PROMPT = `תפקידך לנסח מחדש שאלת המשך כשאלה עצמאית לחיפוש במאגר ידע של תמיכה טכנית.
השתמש בהיסטוריית השיחה כדי להשלים הקשר חסר (למשל "זה", "ואם זה לא עובד").
שמור מונחים מדויקים כפי שהם: שמות מערכות, קודי שגיאה, מילים באנגלית.
החזר רק את השאלה המנוסחת בעברית, בשורה אחת, בלי הסברים.
אם השאלה כבר עצמאית — החזר אותה כפי שהיא.`;

type ChatMessage = { role: "user" | "assistant"; content: string };

async function callChat(
  messages: ChatMessage[],
  systemPrompt: string,
  model: string
): Promise<string> {
  const webReq = new Request("http://localhost/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages, systemPrompt, model }),
  });

  const webRes = await chatHandler(webReq);
  const body = (await webRes.json().catch(() => null)) as {
    content?: string;
    error?: string;
  } | null;

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
    .map((m) => ({ role: m.role, content: m.content.slice(0, MAX_HISTORY_CHARS) }));
}

/**
 * Turn a follow-up into a standalone question for retrieval.
 * No history → no model call. Any failure → original question.
 */
export async function rewriteQuestion(
  question: string,
  history: ChatMessage[]
): Promise<string> {
  if (history.length === 0) return question;
  const transcript = history
    .map((m) => `${m.role === "user" ? "משתמש" : "עוזר"}: ${m.content}`)
    .join("\n\n");
  try {
    const rewritten = await callChat(
      [
        {
          role: "user",
          content: `היסטוריית השיחה:\n${transcript}\n\nשאלת ההמשך:\n${question}`,
        },
      ],
      REWRITE_PROMPT,
      REWRITE_MODEL
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
export async function retrieve(searchQuery: string): Promise<RetrievalResult> {
  const client = createVsServiceClient();
  const keywords = extractKeywordTerms(searchQuery);
  const { embeddings } = await embedTexts([searchQuery]);

  const { data, error } = await client.rpc("match_doc_chunks_hybrid", {
    query_embedding: embeddings[0]!,
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

export async function runAsk(input: {
  question: string;
  history?: AskMessage[];
}): Promise<AskResult> {
  const question = (input.question?.trim() ?? "").slice(0, MAX_QUESTION_CHARS);
  if (!question) {
    throw new Error("question is required");
  }

  const history = cleanHistory(input.history);
  const searchQuery = await rewriteQuestion(question, history);
  const { pages } = await retrieve(searchQuery);

  if (pages.length === 0) {
    return { answer: NO_MATCH_ANSWER, sources: [] };
  }

  const prefix = "הקשר ממסמכי הידע:\n\n";
  const suffix = `\n\n---\n\nשאלת המשתמש:\n${question}`;
  const budget = MAX_USER_MESSAGE_CHARS - prefix.length - suffix.length;
  const { block, included } = buildContext(pages, budget);
  if (included.length === 0) {
    return { answer: NO_MATCH_ANSWER, sources: [] };
  }

  const pageById = new Map(pages.map((p) => [p.documentId, p]));
  const sources: AskSource[] = included.map((p) => {
    const page = pageById.get(p.documentId)!;
    return {
      documentId: page.documentId,
      title: page.title,
      folderName: page.folderName,
      excerpt: page.bestHit.content.slice(0, 400),
      similarity: page.bestSimilarity,
    };
  });

  const answer = await callChat(
    [...history, { role: "user", content: prefix + block + suffix }],
    SYSTEM_PROMPT,
    ANSWER_MODEL
  );

  return { answer, sources };
}
