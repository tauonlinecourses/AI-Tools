/**
 * Sanitize HTML pasted from Google Docs / Word for document bodies.
 * Keeps structure (paragraphs, lists, headings, bold/italic) and safe images.
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

function isItalicStyle(style: string): boolean {
  return /font-style:\s*italic/i.test(style);
}

/**
 * Heading level for a block whose text is `px` big, relative to the paste's
 * normal text size (`basePx`). Relative, because sources differ: OneNote for
 * the web writes body text at 13.5pt (18px), which an absolute "≥17px is a
 * heading" rule turned into bold headings, one per text run.
 */
function headingTagForFontSize(px: number, basePx: number | null): string | null {
  if (basePx === null) {
    // No sizes anywhere else in the paste: fall back to absolute sizes.
    if (px >= 22) return "H2";
    if (px >= 17) return "H3";
    return null;
  }
  const ratio = px / basePx;
  if (ratio >= 1.8) return "H2";
  if (ratio >= 1.4) return "H3";
  if (ratio >= 1.2 && px >= 15) return "H4";
  return null;
}

/** Font size (px) in effect for a node, from the nearest inline style. */
function effectiveFontPx(node: Node, stopAt: Element): number | null {
  let el: Element | null =
    node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement;
  while (el && el !== stopAt) {
    const px = parseFontSizePx(el.getAttribute("style") ?? "");
    if (px !== null) return px;
    el = el.parentElement;
  }
  return null;
}

/**
 * The font size used by most of the text under `root` (weighted by text
 * length), or null when no text has a size.
 */
function dominantFontPx(root: Element, stopAt: Element): number | null {
  const weights = new Map<number, number>();
  const walker = root.ownerDocument.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const len = (n.textContent ?? "").trim().length;
    if (!len) continue;
    const px = effectiveFontPx(n, stopAt);
    if (px === null) continue;
    const key = Math.round(px * 10) / 10;
    weights.set(key, (weights.get(key) ?? 0) + len);
  }
  let best: number | null = null;
  let bestWeight = 0;
  for (const [px, w] of weights) {
    if (w > bestWeight) {
      best = px;
      bestWeight = w;
    }
  }
  return best;
}

function hasBlockChild(el: Element): boolean {
  return Array.from(el.children).some((c) =>
    /^(P|DIV|UL|OL|LI|H[1-6]|BLOCKQUOTE|TABLE)$/i.test(c.tagName)
  );
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

const BLOCK_TAGS = new Set([
  "P",
  "DIV",
  "UL",
  "OL",
  "LI",
  "H1",
  "H2",
  "H3",
  "H4",
  "H5",
  "H6",
  "BLOCKQUOTE",
  "TABLE",
  "TBODY",
  "TR",
  "TD",
  "TH",
  "BR",
]);

/**
 * Blocks that get dir="ltr" when their text is English only, so an English
 * paragraph or list lines up left-to-right inside a Hebrew page. Not
 * dir="auto": that follows the first letter, and Hebrew lines often start
 * with a product name ("Zoom …"). LI is left out on purpose: items follow
 * their list, so the numbers stay on one side.
 */
const AUTO_DIR_TAGS = new Set([
  "P",
  "UL",
  "OL",
  "H1",
  "H2",
  "H3",
  "H4",
  "H5",
  "H6",
  "BLOCKQUOTE",
]);

/** Has Latin letters and no Hebrew letters. */
function isLatinOnly(text: string): boolean {
  return /[A-Za-z]/.test(text) && !/[֐-׿]/.test(text);
}

function isBlockElement(node: Node | null): boolean {
  return (
    node !== null &&
    node.nodeType === Node.ELEMENT_NODE &&
    BLOCK_TAGS.has((node as Element).tagName.toUpperCase())
  );
}

/**
 * Pasted HTML (OneNote, Word) is wrapped source text: line breaks and runs of
 * spaces inside it are formatting noise, not content. The editor shows
 * whitespace as-is (pre-wrap), so fold it to single spaces and drop the
 * whitespace-only text between blocks. &nbsp; is kept (intentional spaces).
 */
function collapsePastedText(node: Text): string | null {
  const raw = node.textContent ?? "";
  let text = raw.replace(/[ \t\r\n\f]+/g, " ");
  const prev = node.previousSibling;
  const next = node.nextSibling;
  const parentIsBlock = isBlockElement(node.parentNode);
  const atBlockStart = (prev === null && parentIsBlock) || isBlockElement(prev);
  const atBlockEnd = (next === null && parentIsBlock) || isBlockElement(next);
  if (atBlockStart) text = text.replace(/^ /, "");
  if (atBlockEnd) text = text.replace(/ $/, "");
  if (!text && raw) return null;
  return text;
}

export interface SanitizeOptions {
  /** Fold source-formatting whitespace (use for pasted HTML only). */
  collapseWhitespace?: boolean;
}

export function sanitizeDocHtml(
  dirty: string,
  { collapseWhitespace = false }: SanitizeOptions = {}
): string {
  if (!dirty.trim()) return "";

  const parser = new DOMParser();
  const doc = parser.parseFromString(dirty, "text/html");
  const body = doc.body;
  if (!body) return "";

  body.querySelectorAll("script, style, meta, link, xml").forEach((el) => {
    el.remove();
  });

  // Normal text size of this paste; headings are judged relative to it.
  const basePx = dominantFontPx(body, body);

  function transform(node: Node): Node | DocumentFragment | null {
    if (node.nodeType === Node.TEXT_NODE) {
      if (collapseWhitespace) {
        const text = collapsePastedText(node as Text);
        return text === null ? null : document.createTextNode(text);
      }
      return document.createTextNode(node.textContent ?? "");
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return null;

    const el = node as HTMLElement;
    const tag = el.tagName.toUpperCase();

    if (tag === "SCRIPT" || tag === "STYLE" || tag === "META" || tag === "LINK") {
      return null;
    }

    if (tag === "B" || tag === "STRONG") {
      const style = el.getAttribute("style") ?? "";
      if (/font-weight:\s*normal/i.test(style)) {
        const frag = document.createDocumentFragment();
        for (const child of Array.from(el.childNodes)) {
          const t = transform(child);
          if (t) frag.appendChild(t);
        }
        return frag;
      }
    }

    const style = el.getAttribute("style") ?? "";
    const fontPx = parseFontSizePx(style);
    const bold = isBoldStyle(style) || tag === "B" || tag === "STRONG";
    const italic = isItalicStyle(style) || tag === "I" || tag === "EM";

    let outTag = tag;
    if (tag === "SPAN" || tag === "FONT") {
      // Inline runs never become headings (that split lines apart); a big
      // run makes its whole paragraph a heading below instead.
      if (bold) outTag = "STRONG";
      else if (italic) outTag = "EM";
      else outTag = "SPAN";
    } else if ((tag === "P" || tag === "DIV") && !hasBlockChild(el)) {
      const textLen = (el.textContent ?? "").trim().length;
      const blockPx = dominantFontPx(el, body) ?? fontPx;
      const heading =
        blockPx != null && textLen > 0 && textLen <= 150
          ? headingTagForFontSize(blockPx, basePx)
          : null;
      if (heading) outTag = heading;
    }

    if (!ALLOWED_TAGS.has(outTag) && outTag !== "SPAN") {
      const frag = document.createDocumentFragment();
      for (const child of Array.from(el.childNodes)) {
        const t = transform(child);
        if (t) frag.appendChild(t);
      }
      return frag;
    }

    if (outTag === "SPAN") {
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

    for (const child of Array.from(el.childNodes)) {
      const t = transform(child);
      if (!t) continue;
      out.appendChild(t);
    }

    if (AUTO_DIR_TAGS.has(outTag) && isLatinOnly(out.textContent ?? "")) {
      out.setAttribute("dir", "ltr");
    }

    if (outTag === "STRONG" && italic) {
      const em = document.createElement("em");
      while (out.firstChild) em.appendChild(out.firstChild);
      out.appendChild(em);
    }

    return out;
  }

  const result = document.createElement("div");
  for (const child of Array.from(body.childNodes)) {
    const t = transform(child);
    if (t) result.appendChild(t);
  }

  return result.innerHTML
    .replace(/&nbsp;/gi, " ")
    .replace(/\u200B/g, "")
    .trim();
}

/** Load stored body into the editor. */
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

export function editorHtmlToBody(html: string): string {
  const trimmed = html.trim();
  if (!trimmed || trimmed === "<br>" || trimmed === "<div><br></div>") {
    return "";
  }
  return html;
}

/** Display sanitize for stored HTML (browser). */
export function sanitizeForDisplay(dirty: string): string {
  if (!dirty.trim()) return "";
  if (typeof document === "undefined") {
    return dirty
      .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, "")
      .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "");
  }
  return sanitizeDocHtml(dirty);
}

// Lists: the indent goes on the *start* side (right in Hebrew), where the
// numbers/bullets sit — otherwise they hang outside the box.
// [overflow-wrap:anywhere]: long URLs/paths wrap instead of widening the box.
export const DOC_BODY_CLASS =
  "doc-body min-w-0 max-w-full text-base font-normal text-surface-800 leading-relaxed text-start whitespace-pre-wrap [overflow-wrap:anywhere] [&_p]:my-1 [&_p]:whitespace-pre-wrap [&_img]:my-2 [&_img]:h-auto [&_img]:max-w-full [&_img]:rounded [&_img]:block [&_a]:text-blue-700 [&_a]:underline [&_h2]:mt-3 [&_h2]:mb-1 [&_h2]:text-xl [&_h2]:font-bold [&_h3]:mt-2 [&_h3]:mb-1 [&_h3]:text-lg [&_h3]:font-bold [&_h4]:mt-2 [&_h4]:text-base [&_h4]:font-semibold [&_ul]:my-2 [&_ul]:list-disc [&_ul]:ps-5 [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:ps-5 [&_li_ul]:my-0.5 [&_li_ol]:my-0.5 [&_li]:my-0.5 [&_li>p]:my-0 [&_strong]:font-bold [&_b]:font-bold [&_em]:italic";
