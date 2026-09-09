/**
 * Server-side OpenAI embeddings (text-embedding-3-small, 1536 dims).
 * Used by Vite middleware and the Vercel /api/embed route.
 * OPENAI_API_KEY must live in server env — never VITE_*.
 */

import OpenAI from "openai";

export const EMBED_MODEL = "text-embedding-3-small";
export const EMBED_DIMENSIONS = 1536;
export const EMBED_MAX_BATCH = 32;

function getServerEnv(): Record<string, string | undefined> {
  return (
    (globalThis as { process?: { env?: Record<string, string | undefined> } })
      .process?.env ?? {}
  );
}

export class EmbedError extends Error {
  statusCode: number;

  constructor(message: string, statusCode = 500) {
    super(message);
    this.name = "EmbedError";
    this.statusCode = statusCode;
  }
}

export interface EmbedResult {
  embeddings: number[][];
  model: string;
  dimensions: number;
}

/**
 * Embed one or more texts with the same model used for kb_chunks indexing
 * and for query-time student-question search.
 */
export async function embedTexts(texts: string[]): Promise<EmbedResult> {
  if (!Array.isArray(texts) || texts.length === 0) {
    throw new EmbedError("texts must be a non-empty array", 400);
  }
  if (texts.length > EMBED_MAX_BATCH) {
    throw new EmbedError(
      `texts batch too large (max ${EMBED_MAX_BATCH})`,
      400
    );
  }
  for (const t of texts) {
    if (typeof t !== "string" || !t.trim()) {
      throw new EmbedError("each text must be a non-empty string", 400);
    }
  }

  const apiKey = getServerEnv().OPENAI_API_KEY?.trim();
  if (!apiKey) {
    throw new EmbedError("Missing OPENAI_API_KEY on server.", 500);
  }

  const client = new OpenAI({ apiKey });
  const response = await client.embeddings.create({
    model: EMBED_MODEL,
    input: texts.map((t) => t.trim()),
    dimensions: EMBED_DIMENSIONS,
  });

  const byIndex = [...response.data].sort((a, b) => a.index - b.index);
  const embeddings = byIndex.map((row) => row.embedding);

  if (embeddings.length !== texts.length) {
    throw new EmbedError("OpenAI returned fewer embeddings than requested");
  }

  return {
    embeddings,
    model: EMBED_MODEL,
    dimensions: EMBED_DIMENSIONS,
  };
}

export function parseEmbedRequestBody(
  body: unknown
): { texts: string[] } | { error: string } {
  if (!body || typeof body !== "object") {
    return { error: "JSON body required" };
  }
  const texts = (body as { texts?: unknown }).texts;
  if (!Array.isArray(texts)) {
    return { error: "texts must be an array of strings" };
  }
  if (texts.length === 0) {
    return { error: "texts must be a non-empty array" };
  }
  if (texts.length > EMBED_MAX_BATCH) {
    return { error: `texts batch too large (max ${EMBED_MAX_BATCH})` };
  }
  if (!texts.every((t) => typeof t === "string" && t.trim().length > 0)) {
    return { error: "each text must be a non-empty string" };
  }
  return { texts: texts as string[] };
}
