/**
 * Server-side HTML → plain text (no DOM). Used for chunking/embedding.
 */

import { createHash } from "node:crypto";

export function htmlToPlainText(html: string): string {
  if (!html.trim()) return "";
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|h[1-6]|li|tr|blockquote)>/gi, "\n")
    .replace(/<img[^>]*alt=["']([^"']*)["'][^>]*>/gi, " $1 ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

export const CHUNK_SIZE = 1200;
export const CHUNK_OVERLAP = 200;

/** Split plain text into overlapping chunks on paragraph boundaries. */
export function chunkPlainText(text: string): string[] {
  const cleaned = text.trim();
  if (!cleaned) return [];

  const paragraphs = cleaned
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);

  if (paragraphs.length === 0) return [];

  const chunks: string[] = [];
  let current = "";

  const flushHard = (s: string) => {
    let rest = s;
    while (rest.length > CHUNK_SIZE) {
      chunks.push(rest.slice(0, CHUNK_SIZE));
      rest = rest.slice(CHUNK_SIZE - CHUNK_OVERLAP);
    }
    return rest;
  };

  for (const para of paragraphs) {
    if (!current) {
      current = flushHard(para);
      continue;
    }
    const combined = `${current}\n\n${para}`;
    if (combined.length <= CHUNK_SIZE) {
      current = combined;
    } else {
      chunks.push(current);
      const overlap = current.slice(-CHUNK_OVERLAP).trim();
      current = flushHard(overlap ? `${overlap}\n\n${para}` : para);
    }
  }

  if (current.trim()) chunks.push(current.trim());
  return chunks;
}

export function documentContentHash(title: string, body: string): string {
  return createHash("sha256")
    .update(`${title.trim()}\n\n${body.trim()}`, "utf8")
    .digest("hex");
}
