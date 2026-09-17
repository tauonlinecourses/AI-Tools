/**
 * Index info_docs into kb_chunks (source_type='info_doc').
 *
 * Retrieval unit = each common question (question-shaped), not the full body.
 * source_id = `${info_doc_id}::${index}`. On hit, hydrate the parent topic.
 * If a topic has no common questions, falls back to embedding the title once.
 * Idempotent via content_hash on the parent doc.
 */

import { embedTexts } from "./embedClient";
import { normalizeCommonQuestions } from "./infoDocs";
import { supabase } from "./supabase";

const SOURCE_TYPE = "info_doc" as const;
/** Keep in sync with server/embedCore EMBED_MAX_BATCH. */
const EMBED_BATCH_SIZE = 32;

export interface InfoDocEmbedResult {
  ok: boolean;
  skipped?: boolean;
  message?: string;
  embedded?: number;
  deleted?: number;
  pending?: number;
}

interface InfoDocRow {
  id: string;
  title: string;
  body: string;
  common_questions: string[] | null;
  content_hash: string | null;
  lang: string | null;
}

interface KbChunkHashRow {
  source_id: string;
  content_hash: string;
}

/** One embeddable retrieval question linked to a parent topic. */
interface EmbedUnit {
  sourceId: string;
  docId: string;
  title: string;
  body: string;
  question: string;
  questionIndex: number;
  contentHash: string;
  lang: string | null;
}

export function infoDocChunkSourceId(docId: string, index: number): string {
  return `${docId}::${index}`;
}

export function parseInfoDocIdFromSourceId(sourceId: string): string {
  const idx = sourceId.indexOf("::");
  if (idx > 0) return sourceId.slice(0, idx);
  return sourceId;
}

function retrievalQuestionsForDoc(doc: InfoDocRow): string[] {
  const qs = normalizeCommonQuestions(doc.common_questions);
  if (qs.length > 0) return qs;
  const title = doc.title.trim();
  return title ? [title] : [];
}

function unitsForDoc(doc: InfoDocRow): EmbedUnit[] {
  const hash = doc.content_hash ?? "";
  return retrievalQuestionsForDoc(doc).map((question, i) => ({
    sourceId: infoDocChunkSourceId(doc.id, i),
    docId: doc.id,
    title: doc.title,
    body: doc.body,
    question,
    questionIndex: i,
    contentHash: hash,
    lang: doc.lang,
  }));
}

async function loadPendingUnits(): Promise<{
  pending: EmbedUnit[];
  allSourceIds: string[];
  error?: string;
}> {
  if (!supabase) return { pending: [], allSourceIds: [] };

  const { data: docs, error: docsErr } = await supabase
    .from("info_docs")
    .select("id, title, body, common_questions, content_hash, lang");
  if (docsErr) return { pending: [], allSourceIds: [], error: docsErr.message };

  const rows = (docs ?? []) as InfoDocRow[];
  const allUnits = rows.flatMap(unitsForDoc);
  const allSourceIds = allUnits.map((u) => u.sourceId);

  const { data: chunks, error: chunkErr } = await supabase
    .from("kb_chunks")
    .select("source_id, content_hash")
    .eq("source_type", SOURCE_TYPE);
  if (chunkErr) {
    return { pending: [], allSourceIds, error: chunkErr.message };
  }

  const hashBySource = new Map(
    ((chunks ?? []) as KbChunkHashRow[]).map((c) => [
      c.source_id,
      c.content_hash,
    ])
  );

  const pending = allUnits.filter((unit) => {
    if (!unit.contentHash) return true;
    const existing = hashBySource.get(unit.sourceId);
    return !existing || existing !== unit.contentHash;
  });

  return { pending, allSourceIds };
}

async function deleteStaleChunks(keepIds: string[]): Promise<number> {
  if (!supabase) return 0;

  const { data: existing, error } = await supabase
    .from("kb_chunks")
    .select("source_id")
    .eq("source_type", SOURCE_TYPE);
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

async function upsertPendingBatches(pending: EmbedUnit[]): Promise<number> {
  if (!supabase || pending.length === 0) return 0;

  let embedded = 0;
  for (let i = 0; i < pending.length; i += EMBED_BATCH_SIZE) {
    const batch = pending.slice(i, i + EMBED_BATCH_SIZE);
    // Embed the common question itself (question-shaped retrieval).
    const texts = batch.map((u) => u.question.trim());
    const { embeddings } = await embedTexts(texts);

    const rows = batch.map((unit, idx) => ({
      source_type: SOURCE_TYPE,
      source_id: unit.sourceId,
      course_id: null,
      content: texts[idx]!,
      content_hash: unit.contentHash,
      lang: unit.lang,
      metadata: {
        kind: "info_doc",
        info_doc_id: unit.docId,
        title: unit.title,
        body: unit.body,
        common_question: unit.question,
        question_index: unit.questionIndex,
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
 * Embed / refresh kb_chunks for all info_doc common questions. Never throws.
 */
export async function embedInfoDocs(): Promise<InfoDocEmbedResult> {
  if (!supabase) return { ok: false, skipped: true };
  try {
    const { pending, allSourceIds, error } = await loadPendingUnits();
    if (error) return { ok: false, message: error };

    const embedded = await upsertPendingBatches(pending);
    const deleted = await deleteStaleChunks(allSourceIds);

    return {
      ok: true,
      embedded,
      deleted,
      pending: pending.length,
    };
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : "info_doc embed failed",
    };
  }
}

/** Count info_doc question chunks that still need (re)embedding. */
export async function countPendingInfoDocEmbeddings(): Promise<{
  ok: boolean;
  skipped?: boolean;
  count?: number;
  message?: string;
}> {
  if (!supabase) return { ok: false, skipped: true };
  try {
    const { pending, error } = await loadPendingUnits();
    if (error) return { ok: false, message: error };
    return { ok: true, count: pending.length };
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : "count failed",
    };
  }
}
