/**
 * Query-time similarity search over kb_chunks.
 * Uses the same /api/embed model as corpus indexing.
 */

import { embedTexts } from "./embedClient";
import { toPlainText } from "./qaPairing";
import { supabase } from "./supabase";
import type { ForumThread } from "./types";

export interface SimilarQaHit {
  id: string;
  sourceId: string;
  content: string;
  questionSnippet: string;
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

function splitQaContent(content: string): {
  questionSnippet: string;
  answerSnippet: string;
} {
  const parts = content.split(/\n\n+/);
  if (parts.length >= 2) {
    return {
      questionSnippet: parts[0]!.trim(),
      answerSnippet: parts.slice(1).join("\n\n").trim(),
    };
  }
  return { questionSnippet: content.trim(), answerSnippet: "" };
}

/** Plain-text question from a forum thread (title + OP body). */
export function threadQuestionText(thread: ForumThread): string {
  const title = (thread.title ?? "").trim();
  const body = toPlainText(thread.raw_body, thread.rendered_body);
  return [title, body].filter(Boolean).join("\n\n").trim();
}

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

    const hits: SimilarQaHit[] = ((data ?? []) as Array<{
      id: string;
      source_id: string;
      content: string;
      metadata: Record<string, unknown> | null;
      lang: string | null;
      course_id: string | null;
      similarity: number;
    }>).map((row) => {
      const { questionSnippet, answerSnippet } = splitQaContent(row.content);
      return {
        id: row.id,
        sourceId: row.source_id,
        content: row.content,
        questionSnippet,
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
