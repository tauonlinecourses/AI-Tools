import DOMPurify from "dompurify";
import type { TextProps } from "./types";

const ALLOWED_TAGS = ["p", "br", "strong", "b", "h1", "h2", "h3", "a"];
const ALLOWED_ATTR = ["href", "target", "rel"];

/** Shared typography for the TipTap surface and read-only HTML. */
export const textProseClass =
  "text-block-prose w-full text-base text-surface-900 leading-relaxed";

export function sanitizeTextHtml(html: string): string {
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
  });
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Convert legacy plain `markdown` field into a simple HTML paragraph. */
export function plainTextToHtml(text: string): string {
  const escaped = escapeHtml(text).replace(/\n/g, "<br>");
  return `<p>${escaped}</p>`;
}

/**
 * Resolve display/edit HTML from props, migrating legacy `markdown` when needed.
 * Does not persist — callers that edit should write `html` only.
 */
export function resolveTextHtml(props: TextProps): string {
  if (props.html?.trim()) return props.html;
  if (props.markdown?.trim()) return plainTextToHtml(props.markdown);
  return "";
}

/** True when there is no meaningful text content. */
export function isTextHtmlEmpty(html: string | undefined): boolean {
  if (!html?.trim()) return true;
  const plain = htmlToPlainText(html);
  return !plain.trim();
}

/** Strip tags to plain text; block boundaries become newlines. */
export function htmlToPlainText(html: string): string {
  if (!html.trim()) return "";
  const doc = new DOMParser().parseFromString(sanitizeTextHtml(html), "text/html");
  const blocks = doc.body.querySelectorAll("p, h1, h2, h3");
  if (blocks.length === 0) {
    return (doc.body.textContent ?? "").replace(/\u00a0/g, " ").trim();
  }
  return Array.from(blocks)
    .map((el) => (el.textContent ?? "").replace(/\u00a0/g, " ").trim())
    .filter(Boolean)
    .join("\n\n");
}
