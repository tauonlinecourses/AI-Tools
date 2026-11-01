import DOMPurify from "dompurify";
import type { TextProps } from "./types";

const ALLOWED_TAGS = [
  "p",
  "br",
  "strong",
  "b",
  "em",
  "i",
  "u",
  "h1",
  "h2",
  "h3",
  "a",
  "ul",
  "ol",
  "li",
  "span",
];
const ALLOWED_ATTR = ["href", "target", "rel", "style", "dir"];

/** Fixed color palette for the TipTap toolbar. */
export const TEXT_COLORS = [
  { label: "שחור", value: "#111827" },
  { label: "אפור", value: "#6b7280" },
  { label: "אדום", value: "#dc2626" },
  { label: "כחול", value: "#0f6cbf" },
  { label: "ירוק", value: "#16a34a" },
] as const;

const ALLOWED_COLORS = new Set(TEXT_COLORS.map((c) => c.value.toLowerCase()));
const ALLOWED_TEXT_ALIGNS = new Set(["left", "center", "right"]);

const HEX_COLOR_RE = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;

function normalizeColor(value: string): string | null {
  const trimmed = value.trim().toLowerCase();
  if (!HEX_COLOR_RE.test(trimmed)) return null;
  if (trimmed.length === 4) {
    const [, r, g, b] = trimmed;
    return `#${r}${r}${g}${g}${b}${b}`;
  }
  return trimmed;
}

/** Keep only color / text-align declarations we allow (no custom font-size). */
export function sanitizeInlineStyle(style: string): string {
  const kept: string[] = [];
  for (const part of style.split(";")) {
    const colon = part.indexOf(":");
    if (colon < 0) continue;
    const prop = part.slice(0, colon).trim().toLowerCase();
    const rawVal = part.slice(colon + 1).trim();
    if (!rawVal) continue;

    if (prop === "color") {
      const color = normalizeColor(rawVal);
      if (color && ALLOWED_COLORS.has(color)) kept.push(`color: ${color}`);
      continue;
    }
    if (prop === "text-align") {
      const align = rawVal.toLowerCase();
      if (ALLOWED_TEXT_ALIGNS.has(align)) kept.push(`text-align: ${align}`);
    }
  }
  return kept.join("; ");
}

let styleHookInstalled = false;

function ensureStyleHook() {
  if (styleHookInstalled || typeof window === "undefined") return;
  styleHookInstalled = true;
  DOMPurify.addHook("uponSanitizeAttribute", (_node, data) => {
    if (data.attrName !== "style") return;
    data.attrValue = sanitizeInlineStyle(data.attrValue);
    if (!data.attrValue) {
      data.keepAttr = false;
    }
  });
}

/** Shared typography for the TipTap surface and read-only HTML. */
export const textProseClass =
  "text-block-prose w-full text-base text-surface-900 leading-relaxed";

export function sanitizeTextHtml(html: string): string {
  ensureStyleHook();
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
  const blocks = doc.body.querySelectorAll("p, h1, h2, h3, li");
  if (blocks.length === 0) {
    return (doc.body.textContent ?? "").replace(/\u00a0/g, " ").trim();
  }
  return Array.from(blocks)
    .map((el) => (el.textContent ?? "").replace(/\u00a0/g, " ").trim())
    .filter(Boolean)
    .join("\n\n");
}
