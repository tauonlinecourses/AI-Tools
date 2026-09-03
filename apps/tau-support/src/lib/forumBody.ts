/**
 * Render Open edX forum bodies (HTML or markdown with reference images).
 */

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

  if (rawText && hasImageMarkup(rawText) && !/<img\b/i.test(renderedText)) {
    const expanded = markdownRefsToHtml(rawText);
    if (/<img\b/i.test(expanded)) {
      return expanded;
    }
  }

  if (renderedText) {
    return renderedText;
  }

  if (!rawText) {
    return "";
  }

  if (/<[a-z][\s\S]*>/i.test(rawText)) {
    return rawText;
  }

  return markdownRefsToHtml(rawText);
}

export const FORUM_RTL_CLASS = "text-right";

export const FORUM_BODY_CLASS =
  "forum-body text-sm text-surface-700 leading-relaxed text-right [&_p]:my-1 [&_img]:my-2 [&_img]:max-w-full [&_img]:rounded [&_img]:block [&_a]:text-blue-700 [&_a]:underline";
