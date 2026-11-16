import DOMPurify from "dompurify";

/**
 * Sanitize Moodle backup HTML before it is rendered.
 *
 * MBZ Explorer runs on the hub origin, where the Platform session lives, so a
 * crafted .mbz must never get script running there. Course HTML comes from
 * uploaded files and is untrusted.
 *
 * blob: URLs (our hydrated mbz-blob: files) are allowed only where they cannot
 * execute: as media sources, and as download links. A blob: URL is same-origin,
 * so navigating to or framing an HTML/SVG blob would run its scripts.
 */

// Dedicated instance so these hooks never affect other DOMPurify users.
const purify = DOMPurify(window);

/** DOMPurify's default URI allow-list, plus blob:. */
const ALLOWED_URI_REGEXP =
  /^(?:(?:(?:f|ht)tps?|mailto|tel|callto|sms|cid|xmpp|matrix|blob):|[^a-z]|[a-z+.-]+(?:[^a-z+.\-:]|$))/i;

/** Elements whose src may point at a blob: (they render, never execute). */
const BLOB_SRC_TAGS = new Set(["IMG", "VIDEO", "AUDIO", "SOURCE", "TRACK"]);

function isBlobUrl(value: string | null): boolean {
  return Boolean(value && value.trim().toLowerCase().startsWith("blob:"));
}

purify.addHook("afterSanitizeAttributes", (node) => {
  const el = node as Element;
  if (typeof el.getAttribute !== "function") return;

  // Embedded videos (e.g. YouTube): only plain https frames.
  if (el.tagName === "IFRAME") {
    const src = el.getAttribute("src")?.trim() ?? "";
    if (!/^https:\/\//i.test(src)) {
      el.remove();
      return;
    }
  }

  if (isBlobUrl(el.getAttribute("src")) && !BLOB_SRC_TAGS.has(el.tagName)) {
    el.removeAttribute("src");
  }
  if (isBlobUrl(el.getAttribute("poster")) && el.tagName !== "VIDEO") {
    el.removeAttribute("poster");
  }

  const href = el.getAttribute("href");
  if (el.tagName === "A" && isBlobUrl(href)) {
    // Download instead of navigating, so an HTML file can't open on our origin.
    el.setAttribute("download", "");
    el.removeAttribute("target");
  } else if (isBlobUrl(href)) {
    el.removeAttribute("href");
  }

  if (el.tagName === "A" && el.getAttribute("target")) {
    el.setAttribute("rel", "noopener noreferrer");
  }
});

export function sanitizeMbzHtml(html: string): string {
  return purify.sanitize(html, {
    ALLOWED_URI_REGEXP,
    ADD_TAGS: ["iframe"],
    ADD_ATTR: ["allowfullscreen", "frameborder", "target"],
    FORBID_TAGS: ["style", "form", "base", "meta", "link"],
  });
}
