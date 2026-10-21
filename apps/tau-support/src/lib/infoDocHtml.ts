/**
 * Sanitize HTML pasted from Google Docs / Word for info-doc bodies.
 * Keeps structure (paragraphs, lists, headings, bold/italic) and safe images.
 * Strips scripts, classes, and most inline styles.
 */

const ALLOWED_TAGS = new Set([
  "P",
  "BR",
  "DIV",
  "SPAN",
  "STRONG",
  "B",
  "EM",
  "I",
  "U",
  "UL",
  "OL",
  "LI",
  "H1",
  "H2",
  "H3",
  "H4",
  "H5",
  "H6",
  "IMG",
  "A",
  "BLOCKQUOTE",
]);

function parseFontSizePx(style: string): number | null {
  const match = /font-size:\s*([\d.]+)(px|pt|em|rem)/i.exec(style);
  if (!match) return null;
  const n = Number.parseFloat(match[1]!);
  if (!Number.isFinite(n)) return null;
  const unit = match[2]!.toLowerCase();
  if (unit === "pt") return n * (96 / 72);
  if (unit === "em" || unit === "rem") return n * 16;
  return n;
}

function isBoldStyle(style: string): boolean {
  return /font-weight:\s*(bold|[6-9]00)/i.test(style);
}

/** Contenteditable "unbold" often leaves <b style="font-weight:normal">. */
function isExplicitlyNotBold(style: string): boolean {
  return /font-weight:\s*(normal|400|500)\b/i.test(style);
}

function isItalicStyle(style: string): boolean {
  return /font-style:\s*italic/i.test(style);
}

function isExplicitlyNotItalic(style: string): boolean {
  return /font-style:\s*normal\b/i.test(style);
}

function headingTagForFontSize(px: number): string | null {
  if (px >= 22) return "H2";
  if (px >= 17) return "H3";
  if (px >= 15) return "H4";
  return null;
}

/** Titles are short; longer “headings” are usually Docs body text with a big font. */
const MAX_PROMOTED_HEADING_CHARS = 48;

function elementTextLength(el: HTMLElement): number {
  return (el.textContent ?? "").replace(/\s+/g, " ").trim().length;
}

function isHeadingTag(tag: string): boolean {
  return /^H[1-6]$/.test(tag);
}

/** Body sentences wrongly stored as headings (ends with . ! ? …). */
function looksLikeSentence(text: string): boolean {
  return /[.!?…׃]\s*$/.test(text.trim());
}

function shouldDemoteHeading(el: HTMLElement, tag: string, style: string): boolean {
  if (!isHeadingTag(tag)) return false;
  if (isExplicitlyNotBold(style)) return true;
  const text = (el.textContent ?? "").replace(/\s+/g, " ").trim();
  if (text.length > MAX_PROMOTED_HEADING_CHARS) return true;
  if (looksLikeSentence(text)) return true;
  // Real headings are rarely nested inside a list item.
  if (el.closest("li")) return true;
  return false;
}

function cleanHref(href: string): string | null {
  const t = href.trim();
  if (!t) return null;
  if (/^https?:\/\//i.test(t) || t.startsWith("/") || t.startsWith("#")) {
    return t;
  }
  return null;
}

function cleanImgSrc(src: string): string | null {
  const t = src.trim();
  if (!t) return null;
  if (
    /^https?:\/\//i.test(t) ||
    t.startsWith("data:image/") ||
    t.startsWith("blob:")
  ) {
    return t;
  }
  return null;
}

/**
 * Convert pasted Docs/Word HTML into a small safe subset for storage + display.
 */
export function sanitizeInfoDocHtml(dirty: string): string {
  if (!dirty.trim()) return "";

  const parser = new DOMParser();
  const doc = parser.parseFromString(dirty, "text/html");
  const body = doc.body;
  if (!body) return "";

  // Drop Google Docs comment markers / scripts / styles.
  body.querySelectorAll("script, style, meta, link, xml").forEach((el) => el.remove());

  function transform(node: Node): Node | DocumentFragment | null {
    if (node.nodeType === Node.TEXT_NODE) {
      return document.createTextNode(node.textContent ?? "");
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return null;

    const el = node as HTMLElement;
    const tag = el.tagName.toUpperCase();

    if (tag === "SCRIPT" || tag === "STYLE" || tag === "META" || tag === "LINK") {
      return null;
    }

    const style = el.getAttribute("style") ?? "";

    // Google Docs + contenteditable "unbold" leave <b style="font-weight:normal">.
    // Unwrap so display CSS (b { font-bold }) cannot revive bold after styles strip.
    if (
      (tag === "B" || tag === "STRONG") &&
      (isExplicitlyNotBold(style) || (!isBoldStyle(style) && style.includes("font-weight")))
    ) {
      const frag = document.createDocumentFragment();
      for (const child of Array.from(el.childNodes)) {
        const t = transform(child);
        if (t) frag.appendChild(t);
      }
      return frag;
    }
    if (
      (tag === "I" || tag === "EM") &&
      (isExplicitlyNotItalic(style) ||
        (!isItalicStyle(style) && style.includes("font-style")))
    ) {
      const frag = document.createDocumentFragment();
      for (const child of Array.from(el.childNodes)) {
        const t = transform(child);
        if (t) frag.appendChild(t);
      }
      return frag;
    }

    const fontPx = parseFontSizePx(style);
    const textLen = elementTextLength(el);
    // Unbold / Docs body-as-heading → demote so [&_h3]:font-bold cannot revive bold.
    const demoteHeading = shouldDemoteHeading(el, tag, style);

    const bold =
      !demoteHeading &&
      (isBoldStyle(style) || tag === "B" || tag === "STRONG");
    const italic = isItalicStyle(style) || tag === "I" || tag === "EM";

    let outTag = demoteHeading ? "P" : tag;
    if (!demoteHeading && (tag === "SPAN" || tag === "FONT")) {
      // Only promote large+bold+short runs to headings (Docs body is often 17–18px).
      const heading =
        fontPx != null && bold && textLen > 0 && textLen <= MAX_PROMOTED_HEADING_CHARS
          ? headingTagForFontSize(fontPx)
          : null;
      if (heading) outTag = heading;
      else if (bold && italic) outTag = "STRONG";
      else if (bold) outTag = "STRONG";
      else if (italic) outTag = "EM";
      else outTag = "SPAN";
    } else if (
      !demoteHeading &&
      fontPx != null &&
      bold &&
      textLen > 0 &&
      textLen <= MAX_PROMOTED_HEADING_CHARS
    ) {
      const heading = headingTagForFontSize(fontPx);
      if (heading && (tag === "P" || tag === "DIV")) outTag = heading;
    }

    if (!ALLOWED_TAGS.has(outTag) && outTag !== "SPAN") {
      // Unwrap unknown tags but keep children.
      const frag = document.createDocumentFragment();
      for (const child of Array.from(el.childNodes)) {
        const t = transform(child);
        if (t) frag.appendChild(t);
      }
      return frag;
    }

    if (outTag === "SPAN") {
      // Plain span — unwrap.
      const frag = document.createDocumentFragment();
      for (const child of Array.from(el.childNodes)) {
        const t = transform(child);
        if (t) frag.appendChild(t);
      }
      return frag;
    }

    const out = document.createElement(outTag.toLowerCase());

    if (outTag === "IMG") {
      const src = cleanImgSrc(el.getAttribute("src") ?? "");
      if (!src) return null;
      out.setAttribute("src", src);
      const alt = el.getAttribute("alt");
      if (alt) out.setAttribute("alt", alt);
      out.setAttribute("loading", "lazy");
      return out;
    }

    if (outTag === "A") {
      const href = cleanHref(el.getAttribute("href") ?? "");
      if (href) out.setAttribute("href", href);
      out.setAttribute("target", "_blank");
      out.setAttribute("rel", "noopener noreferrer");
    }

    // Promote bold/italic wrappers when style was on a block that stayed a block.
    const parent: HTMLElement = out;
    if (bold && outTag !== "STRONG" && outTag !== "B" && !/^H[1-6]$/.test(outTag)) {
      // Keep block; wrap children later via a strong when appropriate.
    }

    for (const child of Array.from(el.childNodes)) {
      const t = transform(child);
      if (!t) continue;
      parent.appendChild(t);
    }

    // If this was a styled span converted to STRONG but we also wanted italic:
    if (outTag === "STRONG" && italic) {
      const em = document.createElement("em");
      while (out.firstChild) em.appendChild(out.firstChild);
      out.appendChild(em);
    }

    void parent;
    return out;
  }

  const result = document.createElement("div");
  for (const child of Array.from(body.childNodes)) {
    const t = transform(child);
    if (t) result.appendChild(t);
  }

  // Normalize empty divs; collapse Google Docs <p><br></p> noise lightly.
  const html = result.innerHTML
    .replace(/&nbsp;/gi, " ")
    .replace(/\u200B/g, "")
    .trim();

  // Convert markdown-style image leftovers if any slipped in as text — leave as-is.
  return html;
}

/** Load stored body into the editor (HTML as-is; plain text keeps newlines). */
export function bodyToEditorHtml(body: string): string {
  const trimmed = body.trim();
  if (!trimmed) return "";
  if (/<[a-z][\s\S]*>/i.test(trimmed)) return body;
  const escaped = trimmed
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return escaped
    .split(/\n{2,}/)
    .map((para) => `<p>${para.replace(/\n/g, "<br>")}</p>`)
    .join("");
}

/** Read editor HTML for save; treat near-empty contenteditable shells as empty. */
export function editorHtmlToBody(html: string): string {
  const trimmed = html.trim();
  if (!trimmed || trimmed === "<br>" || trimmed === "<div><br></div>") {
    return "";
  }
  // Normalize on save: unwrap faux-bold <b style="font-weight:normal"> etc.
  // Contenteditable often leaves those after the user removes bold.
  return sanitizeInfoDocHtml(trimmed) || trimmed;
}

/**
 * Strip HTML to plain text without DOMParser (Node BFF has no DOM).
 * Used when saving info docs via `/api/tau-data`.
 */
function stripHtmlToPlainText(html: string): string {
  let text = html;
  text = text.replace(/<\s*br\s*\/?\s*>/gi, "\n");
  text = text.replace(/<\/\s*(p|div|li|h[1-6]|tr)\s*>/gi, "\n");
  text = text.replace(/<img[^>]*\salt=["']([^"']*)["'][^>]*>/gi, "$1");
  text = text.replace(/<[^>]+>/g, "");
  text = text
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");
  return text.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

/** Plain text for embeddings / search (strip tags, keep line breaks). */
export function infoDocBodyPlainText(body: string): string {
  if (!body.trim()) return "";
  if (!/<[a-z][\s\S]*>/i.test(body)) return body.trim();

  // Node BFF (tau-data) has no DOMParser — contenteditable always sends HTML.
  if (typeof DOMParser === "undefined") {
    return stripHtmlToPlainText(body);
  }

  const parser = new DOMParser();
  const doc = parser.parseFromString(body, "text/html");
  const root = doc.body;
  if (!root) return stripHtmlToPlainText(body);

  const blocks = new Set([
    "P",
    "DIV",
    "LI",
    "H1",
    "H2",
    "H3",
    "H4",
    "H5",
    "H6",
    "BR",
    "TR",
  ]);

  let out = "";
  const walk = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      out += node.textContent ?? "";
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const el = node as HTMLElement;
    const tag = el.tagName.toUpperCase();
    if (tag === "BR") {
      out += "\n";
      return;
    }
    if (tag === "IMG") {
      const alt = el.getAttribute("alt")?.trim();
      if (alt) out += alt;
      return;
    }
    for (const child of Array.from(el.childNodes)) walk(child);
    if (blocks.has(tag)) out += "\n";
  };
  walk(root);
  return out.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}
