/**
 * Render Open edX forum bodies (HTML or markdown with reference images).
 */

const FORUM_ALLOWED_TAGS = new Set([
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
  "PRE",
  "CODE",
]);

/** Strip scripts/handlers; keep a small safe HTML subset for forum display. */
export function sanitizeForumHtml(dirty: string): string {
  if (!dirty.trim() || typeof document === "undefined") {
    return dirty
      .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, "")
      .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "");
  }

  const parser = new DOMParser();
  const doc = parser.parseFromString(dirty, "text/html");
  const body = doc.body;
  if (!body) return "";

  body.querySelectorAll("script, style, meta, link, iframe, object, embed").forEach((el) => {
    el.remove();
  });

  function walk(node: Node): Node | DocumentFragment | null {
    if (node.nodeType === Node.TEXT_NODE) {
      return document.createTextNode(node.textContent ?? "");
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return null;
    const el = node as HTMLElement;
    const tag = el.tagName.toUpperCase();
    if (!FORUM_ALLOWED_TAGS.has(tag)) {
      const frag = document.createDocumentFragment();
      for (const child of Array.from(el.childNodes)) {
        const t = walk(child);
        if (t) frag.appendChild(t);
      }
      return frag;
    }
    const out = document.createElement(tag.toLowerCase());
    if (tag === "A") {
      const href = el.getAttribute("href")?.trim() ?? "";
      if (/^https?:\/\//i.test(href) || href.startsWith("/") || href.startsWith("#")) {
        out.setAttribute("href", href);
        out.setAttribute("rel", "noopener noreferrer");
        out.setAttribute("target", "_blank");
      }
    }
    if (tag === "IMG") {
      const src = el.getAttribute("src")?.trim() ?? "";
      if (/^https?:\/\//i.test(src) || src.startsWith("data:image/")) {
        out.setAttribute("src", src);
        const alt = el.getAttribute("alt");
        if (alt) out.setAttribute("alt", alt);
        out.setAttribute("loading", "lazy");
      } else {
        return null;
      }
    }
    for (const child of Array.from(el.childNodes)) {
      const t = walk(child);
      if (t) out.appendChild(t);
    }
    return out;
  }

  const result = document.createElement("div");
  for (const child of Array.from(body.childNodes)) {
    const t = walk(child);
    if (t) result.appendChild(t);
  }
  return result.innerHTML;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeAttr(text: string): string {
  return escapeHtml(text).replace(/'/g, "&#39;");
}

function hasImageMarkup(text: string): boolean {
  return /!\[[^\]]*\]\[[^\]]*\]|!\[[^\]]*\]\([^)]+\)|<img\b/i.test(text);
}

export function markdownRefsToHtml(raw: string): string {
  const refs = new Map<string, string>();
  for (const match of raw.matchAll(/^\s*\[(\d+)\]:\s*(\S+)/gm)) {
    refs.set(match[1], match[2]);
  }

  let text = raw.replace(/^\s*\[\d+\]:\s*\S+.*$/gm, "").trim();

  text = text.replace(/!\[([^\]]*)\]\[(\d+)\]/g, (_, alt: string, ref: string) => {
    const src = refs.get(ref);
    return src
      ? `<img alt="${escapeAttr(alt)}" src="${escapeAttr(src)}" loading="lazy" />`
      : `![${alt}][${ref}]`;
  });

  text = text.replace(
    /!\[([^\]]*)\]\(([^)]+)\)/g,
    (_, alt: string, src: string) =>
      `<img alt="${escapeAttr(alt)}" src="${escapeAttr(src)}" loading="lazy" />`
  );

  if (!/<[a-z]/i.test(text)) {
    return text
      .split(/\n{2,}/)
      .map((paragraph) => `<p>${escapeHtml(paragraph).replace(/\n/g, "<br />")}</p>`)
      .join("");
  }

  return text;
}

export function toForumHtml(rendered?: string, raw?: string): string {
  const rawText = raw?.trim() ?? "";
  const renderedText = rendered?.trim() ?? "";

  let html = "";
  if (rawText && hasImageMarkup(rawText) && !/<img\b/i.test(renderedText)) {
    const expanded = markdownRefsToHtml(rawText);
    if (/<img\b/i.test(expanded)) {
      html = expanded;
    }
  }

  if (!html && renderedText) {
    html = renderedText;
  } else if (!html && rawText) {
    html = /<[a-z][\s\S]*>/i.test(rawText)
      ? rawText
      : markdownRefsToHtml(rawText);
  }

  return html ? sanitizeForumHtml(html) : "";
}

export const FORUM_RTL_CLASS = "text-right";

export const FORUM_BODY_CLASS =
  "forum-body text-base font-normal text-surface-800 leading-relaxed text-right whitespace-pre-wrap [&_p]:my-1 [&_p]:whitespace-pre-wrap [&_img]:my-2 [&_img]:max-w-full [&_img]:rounded [&_img]:block [&_a]:text-blue-700 [&_a]:underline [&_h2]:mt-3 [&_h2]:mb-1 [&_h2]:text-xl [&_h2]:font-bold [&_h3]:mt-2 [&_h3]:mb-1 [&_h3]:text-lg [&_h3]:font-bold [&_h4]:mt-2 [&_h4]:text-base [&_h4]:font-semibold [&_ul]:my-2 [&_ul]:list-disc [&_ul]:pe-5 [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pe-5 [&_li]:my-0.5 [&_strong]:font-bold [&_b]:font-bold [&_em]:italic";
