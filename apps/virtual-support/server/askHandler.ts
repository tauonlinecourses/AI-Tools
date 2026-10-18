/**
 * RAG Ask: embed question → match_doc_chunks → grounded Hebrew answer.
 */

import { handler as chatHandler } from "@workspace/ai-client/server";
import { createVsServiceClient } from "./vsSupabase.js";
import { embedTexts } from "./embedCore.js";

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

type ChunkHit = {
  id: string;
  document_id: string;
  chunk_index: number;
  content: string;
  similarity: number;
};

const MATCH_COUNT = 8;
const MATCH_THRESHOLD = 0.3;
const MAX_HISTORY = 12;

const SYSTEM_PROMPT = `אתה עוזר ידע של מחלקת התמיכה הטכנית בארגון.
ענה בעברית, בבהירות ובקיצור.
הסתמך רק על קטעי המסמכים שסופקו בהקשר.
אם הקטעים אינם מכסים את השאלה — אמור במפורש שאין מספיק מידע במאגר הידע, ואל תמציא.
כשאתה משתמש במסמך, ציין את כותרתו.`;

export async function runAsk(input: {
  question: string;
  history?: AskMessage[];
}): Promise<AskResult> {
  const question = input.question?.trim() ?? "";
  if (!question) {
    throw new Error("question is required");
  }

  const client = createVsServiceClient();
  const { embeddings } = await embedTexts([question]);
  const queryEmbedding = embeddings[0]!;

  const { data: hits, error } = await client.rpc("match_doc_chunks", {
    query_embedding: queryEmbedding,
    match_count: MATCH_COUNT,
    match_threshold: MATCH_THRESHOLD,
  });

  if (error) throw new Error(error.message);

  const chunkHits = (hits ?? []) as ChunkHit[];
  if (chunkHits.length === 0) {
    return {
      answer:
        "לא מצאתי מידע רלוונטי במאגר המסמכים לשאלה הזו. נסו לנסח מחדש, או בדקו שמסמך מתאים קיים במערכת.",
      sources: [],
    };
  }

  // Best excerpt per document.
  const bestByDoc = new Map<string, ChunkHit>();
  for (const hit of chunkHits) {
    const prev = bestByDoc.get(hit.document_id);
    if (!prev || hit.similarity > prev.similarity) {
      bestByDoc.set(hit.document_id, hit);
    }
  }

  const docIds = [...bestByDoc.keys()];
  const { data: docs, error: docsErr } = await client
    .from("documents")
    .select("id, title, folder_id")
    .in("id", docIds);
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

  const docMeta = new Map(
    (docs ?? []).map((d) => [
      d.id as string,
      {
        title: (d.title as string) || "ללא כותרת",
        folderName: d.folder_id
          ? folderNameById.get(d.folder_id as string) ?? null
          : null,
      },
    ])
  );

  const sources: AskSource[] = [...bestByDoc.values()]
    .sort((a, b) => b.similarity - a.similarity)
    .map((hit) => {
      const meta = docMeta.get(hit.document_id);
      return {
        documentId: hit.document_id,
        title: meta?.title ?? "ללא כותרת",
        folderName: meta?.folderName ?? null,
        excerpt: hit.content.slice(0, 400),
        similarity: hit.similarity,
      };
    });

  const contextBlock = sources
    .map(
      (s, i) =>
        `[מסמך ${i + 1}: ${s.title}${s.folderName ? ` (${s.folderName})` : ""}]\n${s.excerpt}`
    )
    .join("\n\n---\n\n");

  const history = (input.history ?? [])
    .filter(
      (m) =>
        (m.role === "user" || m.role === "assistant") &&
        typeof m.content === "string" &&
        m.content.trim()
    )
    .slice(-MAX_HISTORY);

  const messages = [
    ...history.map((m) => ({ role: m.role, content: m.content })),
    {
      role: "user" as const,
      content: `הקשר ממסמכי הידע:\n\n${contextBlock}\n\n---\n\nשאלת המשתמש:\n${question}`,
    },
  ];

  const webReq = new Request("http://localhost/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      messages,
      systemPrompt: SYSTEM_PROMPT,
      model: "gpt-4o",
    }),
  });

  const webRes = await chatHandler(webReq);
  const body = (await webRes.json().catch(() => null)) as {
    content?: string;
    error?: string;
  } | null;

  if (!webRes.ok) {
    throw new Error(
      body?.error || `Chat failed (${webRes.status})`
    );
  }

  const answer = (body?.content ?? "").trim();
  if (!answer) {
    throw new Error("Empty model response");
  }

  return { answer, sources };
}
