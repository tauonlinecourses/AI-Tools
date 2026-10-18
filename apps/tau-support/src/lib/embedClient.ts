/**
 * Browser/server client for embeddings.
 * Browser: POST /api/embed (with Platform JWT).
 * Server (BFF): call embedCore directly.
 */

export interface EmbedClientResult {
  embeddings: number[][];
  model: string;
  dimensions: number;
}

type EmbedCoreModule = {
  embedTexts: (input: string[]) => Promise<EmbedClientResult>;
};

async function loadEmbedCore(): Promise<EmbedCoreModule> {
  // Absolute URL from this file. A bare relative specifier breaks under Vite
  // SSR: `new Function` loses import.meta, so Node resolves against
  // vite/dist/node/chunks/ → vite/dist/server/embedCore.js (missing).
  // Prefer `.ts` (Vite SSR); fall back to `.js` (Node / Vercel).
  const importer = new Function(
    "specifier",
    "return import(specifier)"
  ) as (specifier: string) => Promise<EmbedCoreModule>;
  const candidates = [
    new URL("../../server/embedCore.ts", import.meta.url).href,
    new URL("../../server/embedCore.js", import.meta.url).href,
  ];
  let lastErr: unknown;
  for (const specifier of candidates) {
    try {
      return await importer(specifier);
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr;
}

export async function embedTexts(texts: string[]): Promise<EmbedClientResult> {
  if (typeof window === "undefined") {
    const mod = await loadEmbedCore();
    return mod.embedTexts(texts);
  }

  const { authFetch } = await import("@workspace/auth/client");
  const res = await authFetch("/api/embed", {
    method: "POST",
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
