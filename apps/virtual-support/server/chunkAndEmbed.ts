/**
 * Re-index a document into doc_chunks after save.
 * Skips work when content_hash is unchanged from existing chunks.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { embedTexts, EMBED_MAX_BATCH } from "./embedCore.js";
import {
  chunkPlainText,
  documentContentHash,
  htmlToPlainText,
} from "./docPlainText.js";

export async function reindexDocument(
  client: SupabaseClient,
  documentId: string,
  title: string,
  body: string
): Promise<{ chunkCount: number; skipped: boolean }> {
  const hash = documentContentHash(title, body);

  const { data: existing, error: existingErr } = await client
    .from("doc_chunks")
    .select("id, content_hash")
    .eq("document_id", documentId)
    .limit(1);

  if (existingErr) throw new Error(existingErr.message);

  if (
    existing &&
    existing.length > 0 &&
    existing[0]!.content_hash === hash
  ) {
    return { chunkCount: 0, skipped: true };
  }

  // Drop old chunks for this document.
  const { error: delErr } = await client
    .from("doc_chunks")
    .delete()
    .eq("document_id", documentId);
  if (delErr) throw new Error(delErr.message);

  const plain = htmlToPlainText(body);
  const titled = plain
    ? `${title.trim()}\n\n${plain}`
    : title.trim();
  let chunks = chunkPlainText(titled);
  if (chunks.length === 0) {
    // Title-only fallback so empty bodies are still searchable by title.
    if (title.trim()) {
      chunks = [title.trim()];
    } else {
      return { chunkCount: 0, skipped: false };
    }
  }

  const rows: Array<{
    document_id: string;
    chunk_index: number;
    content: string;
    content_hash: string;
    embedding: number[];
  }> = [];

  for (let i = 0; i < chunks.length; i += EMBED_MAX_BATCH) {
    const batch = chunks.slice(i, i + EMBED_MAX_BATCH);
    const { embeddings } = await embedTexts(batch);
    for (let j = 0; j < batch.length; j += 1) {
      rows.push({
        document_id: documentId,
        chunk_index: i + j,
        content: batch[j]!,
        content_hash: hash,
        embedding: embeddings[j]!,
      });
    }
  }

  const { error: insertErr } = await client.from("doc_chunks").insert(rows);
  if (insertErr) throw new Error(insertErr.message);

  // Persist document content_hash for UI / future checks.
  const { error: updateErr } = await client
    .from("documents")
    .update({ content_hash: hash })
    .eq("id", documentId);
  if (updateErr) throw new Error(updateErr.message);

  return { chunkCount: rows.length, skipped: false };
}
