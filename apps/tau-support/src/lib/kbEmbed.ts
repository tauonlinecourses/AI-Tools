/**
 * Index qa_pairs into kb_chunks (Phase 2 embeddings).
 * Idempotent via content_hash — only (re)embeds when missing or changed.
 */

import { embedTexts } from "./embedClient";
import { supabase } from "./supabase";

const SOURCE_TYPE = "qa_pair" as const;
/** Keep in sync with server/embedCore EMBED_MAX_BATCH. */
const EMBED_BATCH_SIZE = 32;

export interface KbEmbedResult {
  ok: boolean;
  skipped?: boolean;
  message?: string;
  embedded?: number;
  deleted?: number;
  pending?: number;
}

interface QaPairRow {
  id: string;
  thread_id: string;
  course_id: string;
  question_text: string;
  answer_text: string;
  content_hash: string | null;
  lang: string | null;
  answer_message_id: string | null;
  answer_selection: string | null;
}

interface KbChunkHashRow {
  source_id: string;
  content_hash: string;
}

function buildEmbedContent(question: string, answer: string): string {
  // Unique delimiter so Q/A can be split even when the question has blank lines.
  return `${question.trim()}\n\n---\n\n${answer.trim()}`.trim();
}

async function loadPendingPairs(courseId?: string): Promise<{
  pending: QaPairRow[];
  allIds: string[];
  error?: string;
}> {
  if (!supabase) return { pending: [], allIds: [] };

  let qaQuery = supabase
    .from("qa_pairs")
    .select(
      "id, thread_id, course_id, question_text, answer_text, content_hash, lang, answer_message_id, answer_selection"
    );
  if (courseId) qaQuery = qaQuery.eq("course_id", courseId);

  const { data: pairs, error: qaErr } = await qaQuery;
  if (qaErr) return { pending: [], allIds: [], error: qaErr.message };

  const qaRows = (pairs ?? []) as QaPairRow[];
  const allIds = qaRows.map((p) => p.id);

  let chunkQuery = supabase
    .from("kb_chunks")
    .select("source_id, content_hash")
    .eq("source_type", SOURCE_TYPE);
  if (courseId) chunkQuery = chunkQuery.eq("course_id", courseId);

  const { data: chunks, error: chunkErr } = await chunkQuery;
  if (chunkErr) return { pending: [], allIds, error: chunkErr.message };

  const hashBySource = new Map(
    ((chunks ?? []) as KbChunkHashRow[]).map((c) => [
      c.source_id,
      c.content_hash,
    ])
  );

  const pending = qaRows.filter((pair) => {
    if (!pair.content_hash) return true;
    const existing = hashBySource.get(pair.id);
    return !existing || existing !== pair.content_hash;
  });

  return { pending, allIds };
}

async function deleteStaleChunks(
  keepIds: string[],
  courseId?: string
): Promise<number> {
  if (!supabase) return 0;

  let existingQuery = supabase
    .from("kb_chunks")
    .select("source_id")
    .eq("source_type", SOURCE_TYPE);
  if (courseId) existingQuery = existingQuery.eq("course_id", courseId);

  const { data: existing, error } = await existingQuery;
  if (error) throw error;

  const keep = new Set(keepIds);
  const stale = ((existing ?? []) as { source_id: string }[])
    .map((r) => r.source_id)
    .filter((id) => !keep.has(id));

  if (stale.length === 0) return 0;

  const { error: delErr } = await supabase
    .from("kb_chunks")
    .delete()
    .eq("source_type", SOURCE_TYPE)
    .in("source_id", stale);
  if (delErr) throw delErr;
  return stale.length;
}

async function upsertPendingBatches(
  pending: QaPairRow[]
): Promise<number> {
  if (!supabase || pending.length === 0) return 0;

  let embedded = 0;
  for (let i = 0; i < pending.length; i += EMBED_BATCH_SIZE) {
    const batch = pending.slice(i, i + EMBED_BATCH_SIZE);
    const texts = batch.map((p) =>
      buildEmbedContent(p.question_text, p.answer_text)
    );
    const { embeddings } = await embedTexts(texts);

    const rows = batch.map((pair, idx) => ({
      source_type: SOURCE_TYPE,
      source_id: pair.id,
      course_id: pair.course_id,
      content: texts[idx]!,
      content_hash: pair.content_hash ?? "",
      lang: pair.lang,
      metadata: {
        thread_id: pair.thread_id,
        answer_message_id: pair.answer_message_id,
        answer_selection: pair.answer_selection,
        question_text: pair.question_text,
        answer_text: pair.answer_text,
      },
      embedding: embeddings[idx]!,
      updated_at: new Date().toISOString(),
    }));

    const { error } = await supabase
      .from("kb_chunks")
      .upsert(rows, { onConflict: "source_type,source_id" });
    if (error) throw error;
    embedded += rows.length;
  }
  return embedded;
}

/**
 * Embed / refresh kb_chunks for one course's qa_pairs. Never throws.
 */
export async function embedQaPairsForCourse(
  courseId: string
): Promise<KbEmbedResult> {
  if (!supabase) return { ok: false, skipped: true };
  try {
    const { pending, allIds, error } = await loadPendingPairs(courseId);
    if (error) return { ok: false, message: error };

    const embedded = await upsertPendingBatches(pending);
    const deleted = await deleteStaleChunks(allIds, courseId);

    return {
      ok: true,
      embedded,
      deleted,
      pending: pending.length,
    };
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : "kb embed failed",
    };
  }
}

/**
 * Backfill all pending qa_pairs across courses (Settings control).
 */
export async function embedAllPendingQaPairs(): Promise<KbEmbedResult> {
  if (!supabase) return { ok: false, skipped: true };
  try {
    const { pending, allIds, error } = await loadPendingPairs();
    if (error) return { ok: false, message: error };

    const embedded = await upsertPendingBatches(pending);
    const deleted = await deleteStaleChunks(allIds);

    return {
      ok: true,
      embedded,
      deleted,
      pending: pending.length,
    };
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : "kb embed backfill failed",
    };
  }
}

/** Count qa_pairs that still need (re)embedding. */
export async function countPendingEmbeddings(): Promise<{
  ok: boolean;
  skipped?: boolean;
  count?: number;
  message?: string;
}> {
  if (!supabase) return { ok: false, skipped: true };
  try {
    const { pending, error } = await loadPendingPairs();
    if (error) return { ok: false, message: error };
    return { ok: true, count: pending.length };
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : "count failed",
    };
  }
}
