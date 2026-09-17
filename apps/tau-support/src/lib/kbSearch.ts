/**
 * Query-time similarity search over kb_chunks.
 * Uses the same /api/embed model as corpus indexing.
 *
 * Display Q/A must come from qa_pairs (or the `---` embed delimiter) — never from
 * a naive blank-line split of kb_chunks.content (questions are title\\n\\nbody).
 */

import { embedTexts } from "./embedClient";
import { parseInfoDocIdFromSourceId } from "./infoDocEmbed";
import { toPlainText } from "./qaPairing";
import { supabase } from "./supabase";
import type { ForumThread } from "./types";

/** Half-life (days) for exponential recency decay after cosine retrieval. */
export const RECENCY_HALF_LIFE_DAYS = 180;

/** RPC hard cap on match_kb_chunks limit. */
const MATCH_COUNT_CAP = 50;

export interface SimilarQaHit {
  id: string;
  sourceId: string;
  /** 'qa_pair' (forum Q↔A) or 'info_doc' (official topic). */
  sourceType: "qa_pair" | "info_doc";
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
  courseName: string | null;
  /** Raw cosine similarity from match_kb_chunks (not decayed). */
  similarity: number;
  /** ISO timestamp of staff answer (`answered_at`, else `created_at`). */
  answeredAt: string | null;
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
  // Info docs store HTML in answerSnippet — do not run Q↔A recovery on them.
  if (hit.sourceType === "info_doc") {
    const title = (hit.questionTitle || hit.questionSnippet || "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    return {
      title,
      body: "",
      answer: (hit.answerSnippet ?? "").trim(),
    };
  }

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

/**
 * Cosine similarity × exponential time decay.
 * Missing dates get no recency boost (treated as infinitely old).
 */
export function recencyAdjustedScore(
  similarity: number,
  answeredAt: string | null | undefined,
  nowMs: number = Date.now(),
  halfLifeDays: number = RECENCY_HALF_LIFE_DAYS
): number {
  if (!answeredAt) {
    return similarity * Math.exp(-1e6 / halfLifeDays);
  }
  const ts = Date.parse(answeredAt);
  if (Number.isNaN(ts)) {
    return similarity * Math.exp(-1e6 / halfLifeDays);
  }
  const ageDays = Math.max(0, (nowMs - ts) / (24 * 60 * 60 * 1000));
  return similarity * Math.exp(-ageDays / halfLifeDays);
}

/**
 * Extra rank weight for official info-doc topics vs past forum Q↔A.
 * Applied only to ranking (UI still shows raw cosine %).
 */
export const INFO_DOC_RANK_MULTIPLIER = 1.35;

/** Ranking score used to order mixed Q↔A + info-doc hits. */
export function rankingScore(
  hit: Pick<SimilarQaHit, "similarity" | "answeredAt" | "sourceType">,
  nowMs: number = Date.now()
): number {
  const base = recencyAdjustedScore(hit.similarity, hit.answeredAt, nowMs);
  return hit.sourceType === "info_doc" ? base * INFO_DOC_RANK_MULTIPLIER : base;
}

function candidatePoolSize(requested: number): number {
  return Math.min(MATCH_COUNT_CAP, Math.max(requested * 4, 20));
}

function pairAnsweredAt(pair: PairRow | undefined): string | null {
  if (!pair) return null;
  const answered = pair.answered_at?.trim();
  if (answered) return answered;
  const created = pair.created_at?.trim();
  return created || null;
}

type PairRow = {
  id: string;
  thread_id: string;
  question_text: string;
  answer_text: string;
  answered_at: string | null;
  created_at: string | null;
};

type InfoDocRow = {
  id: string;
  title: string;
  body: string;
  updated_at: string | null;
  created_at: string | null;
};

type CourseRow = {
  id: string;
  name: string;
  name_he: string | null;
};

/**
 * Embed a student question and return the closest past Q↔A pairs
 * and/or info-doc topics (depending on `filterSourceTypes`).
 *
 * Default `filterSourceTypes: ['qa_pair']` keeps ThreadCard
 * "הצג תשובות דומות" QA-only. Drafts pass both types.
 */
export async function findSimilarQa(
  questionText: string,
  opts?: {
    courseId?: string;
    matchCount?: number;
    matchThreshold?: number;
    /** Defaults to `['qa_pair']`. Pass `null` or both types for mixed grounding. */
    filterSourceTypes?: Array<"qa_pair" | "info_doc"> | null;
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

    const requestedCount = opts?.matchCount ?? 3;
    const filterSourceTypes =
      opts?.filterSourceTypes === undefined
        ? (["qa_pair"] as Array<"qa_pair" | "info_doc">)
        : opts.filterSourceTypes;

    const { data, error } = await supabase.rpc("match_kb_chunks", {
      query_embedding: queryEmbedding,
      match_count: candidatePoolSize(requestedCount),
      filter_course_id: opts?.courseId ?? null,
      match_threshold: opts?.matchThreshold ?? 0.3,
      filter_source_types: filterSourceTypes,
    });

    if (error) {
      return { ok: false, message: error.message };
    }

    const rows = (data ?? []) as Array<{
      id: string;
      source_id: string;
      source_type?: string | null;
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
    const courseIds = [
      ...new Set(
        rows
          .map((r) => (typeof r.course_id === "string" ? r.course_id : null))
          .filter((id): id is string => Boolean(id))
      ),
    ];

    const pairById = new Map<string, PairRow>();
    const pairByThreadId = new Map<string, PairRow>();
    const infoDocById = new Map<string, InfoDocRow>();
    const courseNameById = new Map<string, string>();

    const remember = (pair: PairRow) => {
      pairById.set(pair.id, pair);
      pairById.set(pair.id.toLowerCase(), pair);
      if (pair.thread_id) pairByThreadId.set(pair.thread_id, pair);
    };

    const pairSelect =
      "id, thread_id, question_text, answer_text, answered_at, created_at";

    const qaSourceIds = sourceIds.filter((id) =>
      rows.some(
        (r) =>
          String(r.source_id) === id &&
          (r.source_type === "qa_pair" ||
            r.source_type == null ||
            metaString(r.metadata, "kind") !== "info_doc")
      )
    );

    // Resolve parent info_doc ids from metadata or `uuid::index` source_id.
    const infoDocIds = [
      ...new Set(
        rows
          .filter(
            (r) =>
              r.source_type === "info_doc" ||
              metaString(r.metadata, "kind") === "info_doc"
          )
          .map((r) => {
            const fromMeta = metaString(r.metadata, "info_doc_id");
            if (fromMeta) return fromMeta;
            return parseInfoDocIdFromSourceId(String(r.source_id));
          })
          .filter(Boolean)
      ),
    ];

    if (qaSourceIds.length > 0) {
      const { data: pairs, error: pairErr } = await supabase
        .from("qa_pairs")
        .select(pairSelect)
        .in("id", qaSourceIds);
      if (!pairErr) {
        for (const pair of (pairs ?? []) as PairRow[]) remember(pair);
      }
    }

    if (threadIds.length > 0) {
      const { data: byThread, error: threadErr } = await supabase
        .from("qa_pairs")
        .select(pairSelect)
        .in("thread_id", threadIds);
      if (!threadErr) {
        for (const pair of (byThread ?? []) as PairRow[]) remember(pair);
      }
    }

    if (infoDocIds.length > 0) {
      const { data: docs, error: docsErr } = await supabase
        .from("info_docs")
        .select("id, title, body, updated_at, created_at")
        .in("id", infoDocIds);
      if (!docsErr) {
        for (const doc of (docs ?? []) as InfoDocRow[]) {
          infoDocById.set(doc.id, doc);
          infoDocById.set(doc.id.toLowerCase(), doc);
        }
      }
    }

    if (courseIds.length > 0) {
      const { data: courses, error: courseErr } = await supabase
        .from("courses")
        .select("id, name, name_he")
        .in("id", courseIds);
      if (!courseErr) {
        for (const course of (courses ?? []) as CourseRow[]) {
          const he = course.name_he?.trim();
          const en = course.name?.trim();
          courseNameById.set(course.id, he || en || course.id);
        }
      }
    }

    const nowMs = Date.now();
    const hits: SimilarQaHit[] = rows.map((row) => {
      const metaKind = metaString(row.metadata, "kind");
      const sourceType: "qa_pair" | "info_doc" =
        row.source_type === "info_doc" || metaKind === "info_doc"
          ? "info_doc"
          : "qa_pair";

      if (sourceType === "info_doc") {
        const docId =
          metaString(row.metadata, "info_doc_id") ??
          parseInfoDocIdFromSourceId(String(row.source_id));
        const doc =
          infoDocById.get(docId) ??
          infoDocById.get(docId.toLowerCase());
        const title =
          (doc?.title ?? metaString(row.metadata, "title") ?? "").trim();
        const body =
          (doc?.body ?? metaString(row.metadata, "body") ?? "").trim();
        // Fall back to delimited content if hydration missed.
        let question = title;
        let answer = body;
        if (!question && !answer) {
          const delim = "\n\n---\n\n";
          const idx = (row.content ?? "").indexOf(delim);
          if (idx >= 0) {
            question = row.content.slice(0, idx).trim();
            answer = row.content.slice(idx + delim.length).trim();
          } else {
            question = (row.content ?? "").trim();
          }
        }
        return {
          id: row.id,
          sourceId: row.source_id,
          sourceType: "info_doc",
          content: row.content,
          questionSnippet: question,
          questionTitle: question,
          questionBody: "",
          answerSnippet: answer,
          metadata: {
            ...(row.metadata ?? {}),
            info_doc_id: docId,
          },
          lang: row.lang,
          courseId: row.course_id,
          courseName: null,
          similarity: row.similarity,
          answeredAt: doc?.updated_at ?? doc?.created_at ?? null,
        };
      }

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
        sourceType: "qa_pair",
        content: row.content,
        questionSnippet: question,
        questionTitle: title,
        questionBody: body,
        answerSnippet,
        metadata: row.metadata ?? {},
        lang: row.lang,
        courseId: row.course_id,
        courseName: row.course_id
          ? courseNameById.get(row.course_id) ?? null
          : null,
        similarity: row.similarity,
        answeredAt: pairAnsweredAt(pair),
      };
    });

    hits.sort(
      (a, b) => rankingScore(b, nowMs) - rankingScore(a, nowMs)
    );

    // Keep at most one info_doc hit per parent topic (best score wins).
    const seenInfoDocs = new Set<string>();
    const deduped: SimilarQaHit[] = [];
    for (const hit of hits) {
      if (hit.sourceType === "info_doc") {
        const docId =
          metaString(hit.metadata, "info_doc_id") ??
          parseInfoDocIdFromSourceId(hit.sourceId);
        if (seenInfoDocs.has(docId)) continue;
        seenInfoDocs.add(docId);
      }
      deduped.push(hit);
    }

    return { ok: true, hits: deduped.slice(0, requestedCount) };
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : "Similarity search failed",
    };
  }
}
