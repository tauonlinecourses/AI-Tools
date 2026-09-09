/**
 * Query-time similarity search over kb_chunks.
 * Uses the same /api/embed model as corpus indexing.
 *
 * Display Q/A must come from qa_pairs (or the `---` embed delimiter) — never from
 * a naive blank-line split of kb_chunks.content (questions are title\\n\\nbody).
 */

import { embedTexts } from "./embedClient";
import { toPlainText } from "./qaPairing";
import { supabase } from "./supabase";
import type { ForumThread } from "./types";

export interface SimilarQaHit {
  id: string;
  sourceId: string;
  content: string;
  /** Full question text (title + body), for draft context. */
  questionSnippet: string;
  /** First paragraph — shown as the bold thread title. */
  questionTitle: string;
  /** Remaining question paragraphs — shown under the title. */
  questionBody: string;
  /** Staff answer only. */
  answerSnippet: string;
  metadata: Record<string, unknown>;
  lang: string | null;
  courseId: string | null;
  similarity: number;
}

export interface SimilarQaResult {
  ok: boolean;
  skipped?: boolean;
  message?: string;
  hits?: SimilarQaHit[];
}

export interface SimilarHitDisplay {
  title: string;
  body: string;
  answer: string;
}

/** Common staff-reply openings in Hebrew Campus IL answers. */
const STAFF_OPENING =
  /^(שלום|היי|הי\b|בוקר|ערב|חיים|תודה|צוות|מור[,،\s])/u;

/**
 * Question text is stored as `title\n\nbody` (see qaPairing.threadQuestionText).
 */
export function splitQuestionTitleBody(question: string): {
  title: string;
  body: string;
} {
  const trimmed = question.trim();
  if (!trimmed) return { title: "", body: "" };
  const parts = trimmed
    .split(/\n\n+/)
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length >= 2) {
    return {
      title: parts[0]!,
      body: parts.slice(1).join("\n\n"),
    };
  }
  return { title: trimmed, body: "" };
}

/**
 * Prefer qa_pairs texts. Fall back to `question\n\n---\n\nanswer` embed format.
 * Never split legacy content on blank lines alone.
 */
function qaFromPairOrDelimitedContent(
  content: string,
  pair?: { question_text: string; answer_text: string } | null,
  metaQ?: string | null,
  metaA?: string | null
): { question: string; answer: string } {
  const question = (metaQ || pair?.question_text || "").trim();
  const answer = (metaA || pair?.answer_text || "").trim();
  if (question || answer) {
    // If we have the real question, derive answer from content when answer missing.
    if (question && !answer && content.trim().startsWith(question)) {
      return {
        question,
        answer: content
          .trim()
          .slice(question.length)
          .replace(/^\n+/, "")
          .trim(),
      };
    }
    return { question, answer };
  }

  const delim = "\n\n---\n\n";
  const delimIdx = content.indexOf(delim);
  if (delimIdx >= 0) {
    return {
      question: content.slice(0, delimIdx).trim(),
      answer: content.slice(delimIdx + delim.length).trim(),
    };
  }

  // Last resort: recover title/body vs staff reply from legacy concatenated content.
  return recoverLegacyQa(content);
}

/**
 * Legacy kb_chunks.content is `title\n\nbody\n\nstaffAnswer` (no delimiter).
 * Find the first paragraph that looks like a staff reply and split there.
 */
function recoverLegacyQa(content: string): { question: string; answer: string } {
  const parts = content
    .split(/\n\n+/)
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length === 0) return { question: "", answer: "" };
  if (parts.length === 1) return { question: parts[0]!, answer: "" };

  let answerIdx = parts.findIndex((p, i) => i >= 1 && STAFF_OPENING.test(p));
  if (answerIdx < 0 && parts.length >= 3) {
    // title + body + answer (answer may not start with a greeting)
    answerIdx = parts.length - 1;
  }
  if (answerIdx < 0) {
    // title + answer only (no body) — keep first as question
    return { question: parts[0]!, answer: parts.slice(1).join("\n\n") };
  }
  return {
    question: parts.slice(0, answerIdx).join("\n\n"),
    answer: parts.slice(answerIdx).join("\n\n"),
  };
}

/** Strip question / body prefixes that leaked into the answer (naive split). */
export function cleanStaffAnswer(
  answer: string,
  question: string,
  body = ""
): string {
  let a = answer.trim();
  if (!a) return "";
  const q = question.trim();
  if (q && a.startsWith(q)) {
    a = a.slice(q.length).replace(/^\n+/, "").trim();
  }
  const b = body.trim();
  if (b && a.startsWith(b)) {
    a = a.slice(b.length).replace(/^\n+/, "").trim();
  }
  return a;
}

/**
 * Normalize a hit for UI: correct title / body / staff answer even if an older
 * client left the OP body inside answerSnippet.
 */
export function resolveSimilarHitDisplay(hit: SimilarQaHit): SimilarHitDisplay {
  const content = (hit.content ?? "").trim();
  const storedQ = (hit.questionSnippet ?? "").trim();
  const storedA = (hit.answerSnippet ?? "").trim();

  const contentParts = content
    .split(/\n\n+/)
    .map((p) => p.trim())
    .filter(Boolean);
  const naiveQ = contentParts[0] ?? "";
  const naiveA = contentParts.slice(1).join("\n\n");
  const looksNaive =
    contentParts.length >= 2 &&
    storedQ === naiveQ &&
    storedA === naiveA;

  let question: string;
  let answer: string;

  if (looksNaive) {
    ({ question, answer } = recoverLegacyQa(content));
  } else if (storedQ && storedA) {
    question = storedQ;
    answer = storedA;
  } else {
    ({ question, answer } = qaFromPairOrDelimitedContent(content, null));
    if (storedQ) question = storedQ;
    if (storedA) answer = storedA;
  }

  const { title, body } = splitQuestionTitleBody(question);
  answer = cleanStaffAnswer(answer, question, body);

  return {
    title: title || hit.questionTitle?.trim() || "",
    body: body || hit.questionBody?.trim() || "",
    answer,
  };
}

function metaString(
  metadata: Record<string, unknown> | null | undefined,
  key: string
): string | null {
  const raw = metadata?.[key];
  return typeof raw === "string" && raw.trim() ? raw : null;
}

/** Plain-text question from a forum thread (title + OP body). */
export function threadQuestionText(thread: ForumThread): string {
  const title = (thread.title ?? "").trim();
  const body = toPlainText(thread.raw_body, thread.rendered_body);
  return [title, body].filter(Boolean).join("\n\n").trim();
}

type PairRow = {
  id: string;
  thread_id: string;
  question_text: string;
  answer_text: string;
};

/**
 * Embed a student question and return the closest past Q↔A pairs.
 */
export async function findSimilarQa(
  questionText: string,
  opts?: {
    courseId?: string;
    matchCount?: number;
    matchThreshold?: number;
  }
): Promise<SimilarQaResult> {
  if (!supabase) return { ok: false, skipped: true };
  const text = questionText.trim();
  if (!text) {
    return { ok: false, message: "Empty question text" };
  }

  try {
    const { embeddings } = await embedTexts([text]);
    const queryEmbedding = embeddings[0];
    if (!queryEmbedding) {
      return { ok: false, message: "No embedding returned" };
    }

    const { data, error } = await supabase.rpc("match_kb_chunks", {
      query_embedding: queryEmbedding,
      match_count: opts?.matchCount ?? 3,
      filter_course_id: opts?.courseId ?? null,
      match_threshold: opts?.matchThreshold ?? 0.3,
    });

    if (error) {
      return { ok: false, message: error.message };
    }

    const rows = (data ?? []) as Array<{
      id: string;
      source_id: string;
      content: string;
      metadata: Record<string, unknown> | null;
      lang: string | null;
      course_id: string | null;
      similarity: number;
    }>;

    const sourceIds = [
      ...new Set(rows.map((r) => String(r.source_id)).filter(Boolean)),
    ];
    const threadIds = [
      ...new Set(
        rows
          .map((r) => metaString(r.metadata, "thread_id"))
          .filter((id): id is string => Boolean(id))
      ),
    ];

    const pairById = new Map<string, PairRow>();
    const pairByThreadId = new Map<string, PairRow>();

    const remember = (pair: PairRow) => {
      pairById.set(pair.id, pair);
      pairById.set(pair.id.toLowerCase(), pair);
      if (pair.thread_id) pairByThreadId.set(pair.thread_id, pair);
    };

    if (sourceIds.length > 0) {
      const { data: pairs, error: pairErr } = await supabase
        .from("qa_pairs")
        .select("id, thread_id, question_text, answer_text")
        .in("id", sourceIds);
      if (!pairErr) {
        for (const pair of (pairs ?? []) as PairRow[]) remember(pair);
      }
    }

    if (threadIds.length > 0) {
      const { data: byThread, error: threadErr } = await supabase
        .from("qa_pairs")
        .select("id, thread_id, question_text, answer_text")
        .in("thread_id", threadIds);
      if (!threadErr) {
        for (const pair of (byThread ?? []) as PairRow[]) remember(pair);
      }
    }

    const hits: SimilarQaHit[] = rows.map((row) => {
      const metaQ = metaString(row.metadata, "question_text");
      const metaA = metaString(row.metadata, "answer_text");
      const threadId = metaString(row.metadata, "thread_id");
      const pair =
        pairById.get(String(row.source_id)) ??
        pairById.get(String(row.source_id).toLowerCase()) ??
        (threadId ? pairByThreadId.get(threadId) : undefined);

      const { question, answer } = qaFromPairOrDelimitedContent(
        row.content ?? "",
        pair,
        metaQ,
        metaA
      );
      const { title, body } = splitQuestionTitleBody(question);
      const answerSnippet = cleanStaffAnswer(answer, question, body);

      return {
        id: row.id,
        sourceId: row.source_id,
        content: row.content,
        questionSnippet: question,
        questionTitle: title,
        questionBody: body,
        answerSnippet,
        metadata: row.metadata ?? {},
        lang: row.lang,
        courseId: row.course_id,
        similarity: row.similarity,
      };
    });

    return { ok: true, hits };
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : "Similarity search failed",
    };
  }
}
