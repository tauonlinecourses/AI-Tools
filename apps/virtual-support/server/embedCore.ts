/**
 * Server-side OpenAI embeddings (text-embedding-3-small, 1536 dims).
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
