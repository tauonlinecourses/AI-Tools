/**
 * Browser client for POST /api/embed (server holds OPENAI_API_KEY).
 */

export interface EmbedClientResult {
  embeddings: number[][];
  model: string;
  dimensions: number;
}

export async function embedTexts(texts: string[]): Promise<EmbedClientResult> {
  const res = await fetch("/api/embed", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ texts }),
  });

  let payload: unknown = null;
  try {
    payload = await res.json();
  } catch {
    payload = null;
  }

  if (!res.ok) {
    const message =
      payload &&
      typeof payload === "object" &&
      typeof (payload as { error?: unknown }).error === "string"
        ? (payload as { error: string }).error
        : `Embed request failed (${res.status})`;
    throw new Error(message);
  }

  const result = payload as EmbedClientResult;
  if (!Array.isArray(result?.embeddings)) {
    throw new Error("Invalid embed response");
  }
  return result;
}
