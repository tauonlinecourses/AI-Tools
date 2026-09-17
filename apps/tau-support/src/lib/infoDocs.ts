/**
 * CRUD for official staff info-doc topics (browse UI + RAG corpus).
 * Topics are global (not per-course). content_hash drives idempotent embedding.
 * Retrieval embeds common_questions (question-shaped); display uses title+body.
 */

import { detectLang, hashContent } from "./qaPairing";
import { infoDocBodyPlainText } from "./infoDocHtml";
import { supabase } from "./supabase";

export interface InfoDoc {
  id: string;
  title: string;
  body: string;
  /** Example student phrasings for RAG retrieval. */
  commonQuestions: string[];
  position: number;
  lang: string | null;
  contentHash: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface InfoDocWriteResult {
  ok: boolean;
  skipped?: boolean;
  message?: string;
  doc?: InfoDoc;
}

export interface InfoDocListResult {
  ok: boolean;
  skipped?: boolean;
  message?: string;
  docs?: InfoDoc[];
}

type InfoDocRow = {
  id: string;
  title: string;
  body: string;
  common_questions?: string[] | null;
  position: number;
  lang: string | null;
  content_hash: string | null;
  created_at: string;
  updated_at: string;
};

const INFO_DOC_SELECT =
  "id, title, body, common_questions, position, lang, content_hash, created_at, updated_at";

/** Deduped trimmed common questions (empty strings dropped). */
export function normalizeCommonQuestions(
  questions: string[] | null | undefined
): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of questions ?? []) {
    const q = raw.trim();
    if (!q) continue;
    const key = q.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(q);
  }
  return out;
}

function rowToDoc(row: InfoDocRow): InfoDoc {
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    commonQuestions: normalizeCommonQuestions(row.common_questions),
    position: row.position,
    lang: row.lang,
    contentHash: row.content_hash,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** Hash of title + body + common questions for change detection. */
export function infoDocContentHash(
  title: string,
  body: string,
  commonQuestions: string[] = []
): string {
  const qs = normalizeCommonQuestions(commonQuestions).join("\n");
  return hashContent(`${title.trim()}\n\n${body.trim()}\n\n---\n\n${qs}`);
}

export async function listInfoDocs(): Promise<InfoDocListResult> {
  if (!supabase) return { ok: false, skipped: true };
  try {
    const { data, error } = await supabase
      .from("info_docs")
      .select(INFO_DOC_SELECT)
      .order("position", { ascending: true })
      .order("created_at", { ascending: true });

    if (error) return { ok: false, message: error.message };
    return {
      ok: true,
      docs: ((data ?? []) as InfoDocRow[]).map(rowToDoc),
    };
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : "Failed to list info docs",
    };
  }
}

export async function createInfoDoc(input: {
  title: string;
  body: string;
  commonQuestions?: string[];
  position?: number;
}): Promise<InfoDocWriteResult> {
  if (!supabase) return { ok: false, skipped: true };

  const title = input.title.trim();
  const body = input.body.trim();
  const commonQuestions = normalizeCommonQuestions(input.commonQuestions);
  if (!title) return { ok: false, message: "Title is required" };

  try {
    let position = input.position;
    if (typeof position !== "number" || !Number.isFinite(position)) {
      const { data: maxRows } = await supabase
        .from("info_docs")
        .select("position")
        .order("position", { ascending: false })
        .limit(1);
      const maxPos =
        maxRows && maxRows.length > 0
          ? Number((maxRows[0] as { position: number }).position)
          : -1;
      position = Number.isFinite(maxPos) ? maxPos + 1 : 0;
    }

    const contentHash = infoDocContentHash(title, body, commonQuestions);
    const lang = detectLang(
      `${title}\n${infoDocBodyPlainText(body)}\n${commonQuestions.join("\n")}`
    );

    const { data, error } = await supabase
      .from("info_docs")
      .insert({
        title,
        body,
        common_questions: commonQuestions,
        position,
        lang,
        content_hash: contentHash,
      })
      .select(INFO_DOC_SELECT)
      .single();

    if (error) return { ok: false, message: error.message };
    return { ok: true, doc: rowToDoc(data as InfoDocRow) };
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : "Failed to create info doc",
    };
  }
}

export async function updateInfoDoc(
  id: string,
  input: {
    title: string;
    body: string;
    commonQuestions?: string[];
    position?: number;
  }
): Promise<InfoDocWriteResult> {
  if (!supabase) return { ok: false, skipped: true };

  const title = input.title.trim();
  const body = input.body.trim();
  const commonQuestions = normalizeCommonQuestions(input.commonQuestions);
  if (!title) return { ok: false, message: "Title is required" };

  try {
    const patch: Record<string, unknown> = {
      title,
      body,
      common_questions: commonQuestions,
      lang: detectLang(
        `${title}\n${infoDocBodyPlainText(body)}\n${commonQuestions.join("\n")}`
      ),
      content_hash: infoDocContentHash(title, body, commonQuestions),
    };
    if (typeof input.position === "number" && Number.isFinite(input.position)) {
      patch.position = input.position;
    }

    const { data, error } = await supabase
      .from("info_docs")
      .update(patch)
      .eq("id", id)
      .select(INFO_DOC_SELECT)
      .single();

    if (error) return { ok: false, message: error.message };
    return { ok: true, doc: rowToDoc(data as InfoDocRow) };
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : "Failed to update info doc",
    };
  }
}

export async function deleteInfoDoc(id: string): Promise<{
  ok: boolean;
  skipped?: boolean;
  message?: string;
}> {
  if (!supabase) return { ok: false, skipped: true };
  try {
    // Remove all question-chunks for this topic (id::N) plus legacy bare id.
    const { data: chunkRows } = await supabase
      .from("kb_chunks")
      .select("source_id")
      .eq("source_type", "info_doc");
    const toDelete = ((chunkRows ?? []) as { source_id: string }[])
      .map((r) => r.source_id)
      .filter(
        (sid) => sid === id || sid.startsWith(`${id}::`)
      );
    if (toDelete.length > 0) {
      const { error: chunkErr } = await supabase
        .from("kb_chunks")
        .delete()
        .eq("source_type", "info_doc")
        .in("source_id", toDelete);
      if (chunkErr) {
        console.warn(
          `[tau-support] Failed to delete info_doc kb chunks: ${chunkErr.message}`
        );
      }
    }

    const { error } = await supabase.from("info_docs").delete().eq("id", id);
    if (error) return { ok: false, message: error.message };
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : "Failed to delete info doc",
    };
  }
}

/**
 * Persist an ordered list of topic ids as sequential positions (0..n-1).
 */
export async function reorderInfoDocs(orderedIds: string[]): Promise<{
  ok: boolean;
  skipped?: boolean;
  message?: string;
}> {
  if (!supabase) return { ok: false, skipped: true };
  try {
    for (let i = 0; i < orderedIds.length; i += 1) {
      const id = orderedIds[i]!;
      const { error } = await supabase
        .from("info_docs")
        .update({ position: i })
        .eq("id", id);
      if (error) return { ok: false, message: error.message };
    }
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : "Failed to reorder info docs",
    };
  }
}
