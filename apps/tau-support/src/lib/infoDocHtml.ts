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

function isItalicStyle(style: string): boolean {
  return /font-style:\s*italic/i.test(style);
}

function headingTagForFontSize(px: number): string | null {
  if (px >= 22) return "H2";
  if (px >= 17) return "H3";
  if (px >= 15) return "H4";
  return null;
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

    // Google Docs often wraps everything in <b style="font-weight:normal">.
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
      const heading = fontPx != null ? headingTagForFontSize(fontPx) : null;
      if (heading) outTag = heading;
      else if (bold && italic) outTag = "STRONG";
      else if (bold) outTag = "STRONG";
      else if (italic) outTag = "EM";
      else outTag = "SPAN";
    } else if (fontPx != null) {
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
    let parent: HTMLElement = out;
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
  let html = result.innerHTML
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
  return html;
}

/** Plain text for embeddings / search (strip tags, keep line breaks). */
export function infoDocBodyPlainText(body: string): string {
  if (!body.trim()) return "";
  if (!/<[a-z][\s\S]*>/i.test(body)) return body.trim();

  const parser = new DOMParser();
  const doc = parser.parseFromString(body, "text/html");
  const root = doc.body;
  if (!root) return body.replace(/<[^>]+>/g, " ").trim();

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
