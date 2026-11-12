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
  // Moodle callouts / wrappers — TipTap flattens on edit; preview keeps structure.
  "div",
];
const ALLOWED_ATTR = ["href", "target", "rel", "style", "dir", "title"];

/** Fixed color palette for the TipTap toolbar. */
export const TEXT_COLORS = [
  { label: "שחור", value: "#111827" },
  { label: "אפור", value: "#6b7280" },
  { label: "אדום", value: "#dc2626" },
  { label: "כחול", value: "#0f6cbf" },
  { label: "ירוק", value: "#16a34a" },
] as const;

const ALLOWED_TEXT_ALIGNS = new Set(["left", "center", "right"]);

const HEX_COLOR_RE = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;
const RGB_COLOR_RE =
  /^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})(?:\s*,\s*[\d.]+)?\s*\)$/i;

/** Named colors Moodle often uses in inline styles / <font color>. */
const NAMED_COLORS: Record<string, string> = {
  black: "#000000",
  white: "#ffffff",
  red: "#ff0000",
  blue: "#0000ff",
  green: "#008000",
  gray: "#808080",
  grey: "#808080",
  navy: "#000080",
  maroon: "#800000",
  purple: "#800080",
  teal: "#008080",
  orange: "#ffa500",
};

function clampByte(n: number): number {
  return Math.max(0, Math.min(255, n));
}

function toHexByte(n: number): string {
  return clampByte(n).toString(16).padStart(2, "0");
}

/**
 * Normalize a CSS color to #rrggbb when safe.
 * Toolbar picks from TEXT_COLORS; imported Moodle HTML may use any hex/rgb/name.
 */
export function normalizeColor(value: string): string | null {
  const trimmed = value.trim().toLowerCase();
  if (!trimmed || trimmed === "transparent" || trimmed === "inherit" || trimmed === "currentcolor") {
    return null;
  }
  if (NAMED_COLORS[trimmed]) return NAMED_COLORS[trimmed]!;
  if (HEX_COLOR_RE.test(trimmed)) {
    if (trimmed.length === 4) {
      const [, r, g, b] = trimmed;
      return `#${r}${r}${g}${g}${b}${b}`;
    }
    return trimmed;
  }
  const rgb = trimmed.match(RGB_COLOR_RE);
  if (rgb) {
    return `#${toHexByte(Number(rgb[1]))}${toHexByte(Number(rgb[2]))}${toHexByte(Number(rgb[3]))}`;
  }
  return null;
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
      if (color) kept.push(`color: ${color}`);
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

/**
 * Moodle often uses <font color="…"> and color= attributes.
 * Rewrite to <span style="color:…"> before DOMPurify so imported links/colors survive.
 */
export function normalizeLegacyColorMarkup(html: string): string {
  let out = html.replace(
    /<font\b([^>]*)>([\s\S]*?)<\/font>/gi,
    (_full, attrs: string, inner: string) => {
      const colorMatch = attrs.match(/\bcolor\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/i);
      const raw = colorMatch?.[2] ?? colorMatch?.[3] ?? colorMatch?.[4] ?? "";
      const color = normalizeColor(raw);
      if (!color) return inner;
      return `<span style="color: ${color}">${inner}</span>`;
    }
  );
  // Bare color="…" on span/p/strong (some Moodle themes)
  out = out.replace(
    /<(span|p|strong|b|em|i|u|a)\b([^>]*?)\scolor\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))([^>]*)>/gi,
    (_full, tag: string, before: string, _q: string, d1: string, d2: string, d3: string, after: string) => {
      const color = normalizeColor(d1 ?? d2 ?? d3 ?? "");
      if (!color) return `<${tag}${before}${after}>`;
      const styleMatch = `${before}${after}`.match(/\bstyle\s*=\s*("([^"]*)"|'([^']*)')/i);
      if (styleMatch) {
        const existing = styleMatch[2] ?? styleMatch[3] ?? "";
        const merged = sanitizeInlineStyle(`${existing}; color: ${color}`);
        const withoutStyle = `${before}${after}`.replace(/\sstyle\s*=\s*("([^"]*)"|'([^']*)')/i, "");
        return `<${tag}${withoutStyle} style="${merged}">`;
      }
      return `<${tag}${before}${after} style="color: ${color}">`;
    }
  );
  return out;
}

export function sanitizeTextHtml(html: string): string {
  ensureStyleHook();
  const normalized = normalizeLegacyColorMarkup(html);
  return DOMPurify.sanitize(normalized, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    // Keep Moodle / relative / token hrefs (e.g. $@RESOURCEVIEWBYID*1@$)
    ALLOW_UNKNOWN_PROTOCOLS: true,
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
