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

export function sanitizeDocHtml(dirty: string): string {
  if (!dirty.trim()) return "";

  const parser = new DOMParser();
  const doc = parser.parseFromString(dirty, "text/html");
  const body = doc.body;
  if (!body) return "";

  body.querySelectorAll("script, style, meta, link, xml").forEach((el) => {
    el.remove();
  });

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

export const DOC_BODY_CLASS =
  "doc-body text-base font-normal text-surface-800 leading-relaxed text-right whitespace-pre-wrap [&_p]:my-1 [&_p]:whitespace-pre-wrap [&_img]:my-2 [&_img]:max-w-full [&_img]:rounded [&_img]:block [&_a]:text-blue-700 [&_a]:underline [&_h2]:mt-3 [&_h2]:mb-1 [&_h2]:text-xl [&_h2]:font-bold [&_h3]:mt-2 [&_h3]:mb-1 [&_h3]:text-lg [&_h3]:font-bold [&_h4]:mt-2 [&_h4]:text-base [&_h4]:font-semibold [&_ul]:my-2 [&_ul]:list-disc [&_ul]:pe-5 [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pe-5 [&_li]:my-0.5 [&_strong]:font-bold [&_b]:font-bold [&_em]:italic";
