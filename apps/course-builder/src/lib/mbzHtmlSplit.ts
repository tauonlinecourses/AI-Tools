/**
 * Split Moodle page/intro HTML into Course Builder components
 * (banner, video, image, text_unit/button, text) while preserving order.
 * Missing binaries are fine — pluginfile paths / URLs stay in props for implementers.
 */

import { detectVideoProvider } from "./videoEmbed";
import type { BlockProps, ComponentType } from "./types";

export interface MappedComponent {
  type: ComponentType;
  position: number;
  props: BlockProps;
}

function decodeBasicEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function attr(tag: string, name: string): string | null {
  const re = new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)')`, "i");
  const m = tag.match(re);
  if (!m) return null;
  return decodeBasicEntities(m[2] ?? m[3] ?? "");
}

/** Keep @@PLUGINFILE@@ refs readable; leave http(s) as-is. */
export function normalizeMediaUrl(raw: string | null | undefined): string {
  if (!raw) return "";
  const url = decodeBasicEntities(raw.trim());
  if (/^@@PLUGINFILE@@\//i.test(url)) {
    const rest = url.slice("@@PLUGINFILE@@/".length);
    try {
      return `@@PLUGINFILE@@/${decodeURIComponent(rest.replace(/\+/g, " "))}`;
    } catch {
      return url;
    }
  }
  return url;
}

function isEmptyHtml(html: string): boolean {
  const t = html
    .replace(/&nbsp;/gi, " ")
    .replace(/\u00a0/g, " ")
    .replace(/<br\s*\/?>/gi, "")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, "")
    .trim();
  return !t;
}

function hasMediaTags(html: string): boolean {
  return /<(iframe|img|video|audio|source)\b/i.test(html);
}

function looksLikeBanner(src: string, alt: string, width: number | null, height: number | null): boolean {
  const hay = `${src} ${alt}`.toLowerCase();
  if (/באנר|banner|hero|header/.test(hay)) return true;
  // Wide lesson header images (common Moodle pattern)
  if (width != null && height != null && height > 0 && width / height >= 2.5 && width >= 500) {
    return true;
  }
  if (width != null && width >= 800 && (height == null || height <= 400)) return true;
  return false;
}

function looksLikeImageButton(src: string, alt: string, width: number | null, height: number | null): boolean {
  const hay = `${src} ${alt}`.toLowerCase();
  if (/כפתור|button|cta|תמליל|הפניה|frame\s*\d|לציר/.test(hay)) return true;
  // Compact CTA chips (transcript / download buttons)
  if (width != null && height != null && width <= 400 && height <= 120 && width / Math.max(height, 1) >= 1.5) {
    return true;
  }
  return false;
}

function isVideoSrc(url: string): boolean {
  if (!url) return false;
  const provider = detectVideoProvider(url);
  if (provider === "youtube" || provider === "panopto" || provider === "sharepoint") return true;
  try {
    const host = new URL(url).hostname.toLowerCase();
    if (host.includes("panopto") || host.includes("youtube") || host.includes("youtu.be")) return true;
    if (host.includes("vimeo") || host.includes("cloudflarestream")) return true;
  } catch {
    /* ignore */
  }
  return /\/Embed\.aspx|\/Viewer\.aspx|\/embed\//i.test(url);
}

/** Moodle often wraps the whole page in one layout div — peel those off. */
function unwrapLayoutWrappers(html: string): string {
  let body = html.trim();
  for (let n = 0; n < 6; n += 1) {
    const m = body.match(/^<div\b([^>]*)>([\s\S]*)<\/div>\s*$/i);
    if (!m) break;
    const openAttrs = m[1] ?? "";
    const inner = (m[2] ?? "").trim();
    if (!inner) break;
    // Only unwrap layout shells (not semantic content boxes with borders / callouts)
    const style = attr(`<div ${openAttrs}>`, "style") ?? "";
    const isLayout =
      /max-width|overflow|text-align\s*:\s*center|height\s*:|margin\s*:\s*0\s+auto|padding-bottom\s*:\s*56/i.test(
        style
      ) ||
      /max-width|overflow|text-align|img-fluid/i.test(openAttrs) ||
      (!style && !/class\s*=/i.test(openAttrs));
    const isCallout = /border\s*:\s*\d/i.test(style) || /background/i.test(style);
    if (!isLayout || isCallout) break;
    // Don't unwrap if this div is a pure media leaf (handled by classifier)
    if (isIframeOnlyBlock(body) || isLinkedImageOnlyBlock(body) || isImageOnlyBlock(body)) break;
    body = inner;
  }
  return body;
}

/**
 * Split a blob of HTML into ordered top-level segments (tag soup aware enough for Moodle).
 * Layout wrappers are unwrapped; mixed container divs are recursively flattened so
 * banner / video / image-button siblings surface as their own segments.
 */
export function splitTopLevelSegments(html: string): string[] {
  const input = html.trim();
  if (!input) return [];
  return flattenSegments(unwrapLayoutWrappers(input));
}

const VOID_TAGS = new Set(["br", "hr", "img", "source", "meta", "link", "input", "col", "wbr"]);

function matchOpenTag(body: string, from: number): { name: string; end: number; selfClosing: boolean } | null {
  const slice = body.slice(from);
  const m = slice.match(/^<([a-z0-9]+)\b([^<>]*)>/i);
  if (!m) return null;
  const name = m[1]!.toLowerCase();
  const attrs = m[2] ?? "";
  const selfClosing = VOID_TAGS.has(name) || /\/\s*$/.test(attrs);
  return { name, end: from + m[0].length, selfClosing };
}

function matchCloseTag(body: string, from: number): { name: string; end: number } | null {
  const m = body.slice(from).match(/^<\/([a-z0-9]+)\s*>/i);
  if (!m) return null;
  return { name: m[1]!.toLowerCase(), end: from + m[0].length };
}

function findMatchingClose(body: string, tagName: string, afterOpen: number): number {
  let depth = 1;
  let pos = afterOpen;
  while (pos < body.length) {
    const lt = body.indexOf("<", pos);
    if (lt < 0) return -1;
    const close = matchCloseTag(body, lt);
    if (close) {
      if (close.name === tagName) {
        depth -= 1;
        if (depth === 0) return close.end;
      }
      pos = close.end;
      continue;
    }
    const open = matchOpenTag(body, lt);
    if (open) {
      if (!open.selfClosing && open.name === tagName) depth += 1;
      pos = open.end;
      continue;
    }
    // Comment / doctype / orphan junk — skip the "<"
    pos = lt + 1;
  }
  return -1;
}

function splitOnce(body: string): string[] {
  const segments: string[] = [];
  let i = 0;
  while (i < body.length) {
    while (i < body.length && /\s/.test(body[i]!)) i += 1;
    if (i >= body.length) break;

    if (body[i] !== "<") {
      const next = body.indexOf("<", i);
      const text = body.slice(i, next < 0 ? body.length : next).trim();
      if (text) segments.push(text);
      i = next < 0 ? body.length : next;
      continue;
    }

    // Orphan closing tag — drop
    const orphanClose = matchCloseTag(body, i);
    if (orphanClose) {
      i = orphanClose.end;
      continue;
    }

    const open = matchOpenTag(body, i);
    if (!open) {
      i += 1;
      continue;
    }

    if (open.selfClosing) {
      segments.push(body.slice(i, open.end).trim());
      i = open.end;
      continue;
    }

    const end = findMatchingClose(body, open.name, open.end);
    if (end < 0) {
      segments.push(body.slice(i).trim());
      break;
    }
    segments.push(body.slice(i, end).trim());
    i = end;
  }
  return segments.filter(Boolean);
}

function isContainerTag(segment: string): boolean {
  return /^<(div|section|article|figure|center)\b/i.test(segment);
}

function innerHtmlOf(segment: string): string | null {
  const open = matchOpenTag(segment, 0);
  if (!open || open.selfClosing) return null;
  const closeRe = new RegExp(`</${open.name}\\s*>$`, "i");
  if (!closeRe.test(segment)) return null;
  return segment.slice(open.end, segment.length - segment.match(closeRe)![0].length).trim();
}

/** True when a container mixes media with other siblings — needs flattening. */
function shouldFlattenContainer(segment: string): boolean {
  if (!isContainerTag(segment)) return false;
  if (isIframeOnlyBlock(segment) || isLinkedImageOnlyBlock(segment) || isImageOnlyBlock(segment)) {
    return false;
  }
  if (isMultiLinkedImageBlock(segment)) return true;
  const inner = innerHtmlOf(segment);
  if (!inner || !hasMediaTags(inner)) return false;
  // Callout boxes with only text stay intact; media inside still flattens
  return true;
}

/** Split a media-only wrapper that holds several image CTAs into one segment each. */
function splitMultiImageCtas(segment: string): string[] | null {
  if (!isMultiLinkedImageBlock(segment) && !isMultiLinkedImageBlock(innerHtmlOf(segment) ?? "")) {
    return null;
  }
  const source = isContainerTag(segment) ? (innerHtmlOf(segment) ?? segment) : segment;
  const links = source.match(/<a\b[^>]*>[\s\S]*?<img\b[^>]*>[\s\S]*?<\/a>/gi);
  return links && links.length > 1 ? links : null;
}

function flattenSegments(html: string, depth = 0): string[] {
  if (depth > 8) return [html];
  const body = unwrapLayoutWrappers(html);
  const once = splitOnce(body);
  const out: string[] = [];
  for (const seg of once) {
    if (shouldFlattenContainer(seg)) {
      const inner = innerHtmlOf(seg);
      if (inner) {
        out.push(...flattenSegments(inner, depth + 1));
        continue;
      }
    }
    const ctas = splitMultiImageCtas(seg);
    if (ctas) {
      out.push(...ctas);
      continue;
    }
    out.push(seg);
  }
  return out;
}

type Classified =
  | { kind: "banner"; imageUrl: string; title?: string }
  | { kind: "image"; imageUrl: string }
  | { kind: "video"; url: string; title?: string }
  | { kind: "interactive"; url: string; title?: string }
  | { kind: "text_unit"; imageUrl: string; fileUrl: string; alt?: string }
  | { kind: "button"; text: string; url: string }
  | { kind: "text"; html: string }
  | { kind: "skip" };

/** Strip iframes/imgs/anchors and see if any prose remains. */
function withoutMediaChrome(html: string): string {
  return html
    .replace(/<iframe\b[\s\S]*?<\/iframe>/gi, "")
    .replace(/<iframe\b[^>]*\/?>/gi, "")
    .replace(/<a\b[^>]*>[\s\S]*?<img\b[^>]*>[\s\S]*?<\/a>/gi, "")
    .replace(/<img\b[^>]*>/gi, "")
    .replace(/<a\b[^>]*>\s*<\/a>/gi, "")
    .replace(/<video\b[\s\S]*?<\/video>/gi, "");
}

function isIframeOnlyBlock(html: string): boolean {
  // Must be iframe-only — image CTAs sharing a wrapper must not be swallowed as "video".
  return (
    /<iframe\b/i.test(html) &&
    !/<img\b/i.test(html) &&
    isEmptyHtml(withoutMediaChrome(html))
  );
}

function isLinkedImageOnlyBlock(html: string): boolean {
  const links = html.match(/<a\b[^>]*>[\s\S]*?<img\b[^>]*>[\s\S]*?<\/a>/gi);
  return (
    !!links &&
    links.length === 1 &&
    !/<iframe\b/i.test(html) &&
    isEmptyHtml(withoutMediaChrome(html))
  );
}

/** Several image CTAs in one centered wrapper — flatten into separate buttons. */
function isMultiLinkedImageBlock(html: string): boolean {
  const links = html.match(/<a\b[^>]*>[\s\S]*?<img\b[^>]*>[\s\S]*?<\/a>/gi);
  return (
    !!links &&
    links.length > 1 &&
    !/<iframe\b/i.test(html) &&
    isEmptyHtml(withoutMediaChrome(html))
  );
}

function isImageOnlyBlock(html: string): boolean {
  return (
    /<img\b/i.test(html) &&
    !/<iframe\b/i.test(html) &&
    !/<a\b/i.test(html) &&
    isEmptyHtml(withoutMediaChrome(html))
  );
}

function readImgMeta(imgTag: string): {
  src: string;
  alt: string;
  width: number | null;
  height: number | null;
} {
  const src = normalizeMediaUrl(attr(imgTag, "src"));
  const alt = attr(imgTag, "alt") ?? "";
  const width = parseInt(attr(imgTag, "width") ?? "", 10);
  const height = parseInt(attr(imgTag, "height") ?? "", 10);
  return {
    src,
    alt,
    width: Number.isFinite(width) ? width : null,
    height: Number.isFinite(height) ? height : null,
  };
}

function classifySegment(
  segment: string,
  state: { imageIndex: number; sawBanner: boolean }
): Classified {
  const s = segment.trim();
  if (!s) return { kind: "skip" };
  if (isEmptyHtml(s) && !hasMediaTags(s)) return { kind: "skip" };

  if (/^<(br|hr)\b[^>]*\/?>$/i.test(s)) return { kind: "skip" };

  // iframe-only block (Panopto / Genially / YouTube wrappers)
  if (isIframeOnlyBlock(s)) {
    const iframe = s.match(/<iframe\b[^>]*>/i);
    if (iframe) {
      const src = normalizeMediaUrl(attr(iframe[0], "src"));
      const title =
        attr(iframe[0], "aria-description") ||
        attr(iframe[0], "title") ||
        attr(iframe[0], "aria-label") ||
        undefined;
      if (src) {
        if (isVideoSrc(src)) {
          return { kind: "video", url: src, title: title ?? undefined };
        }
        return { kind: "interactive", url: src, title: title ?? undefined };
      }
    }
  }

  // Linked image CTA / image button: <a ...><img ...></a>
  if (isLinkedImageOnlyBlock(s)) {
    const linkedImg = s.match(/<a\b([^>]*)>[\s\S]*?<img\b([^>]*)>[\s\S]*?<\/a>/i);
    if (linkedImg) {
      const aTag = `<a ${linkedImg[1]}>`;
      const imgTag = `<img ${linkedImg[2]}>`;
      const href = normalizeMediaUrl(attr(aTag, "href") ?? attr(aTag, "title"));
      const { src, alt, width, height } = readImgMeta(imgTag);
      const label = alt || attr(aTag, "title") || "כפתור";

      // Wide linked banner image (rare) → banner; else image button → text_unit
      if (!state.sawBanner && looksLikeBanner(src, alt, width, height) && !looksLikeImageButton(src, alt, width, height)) {
        state.imageIndex += 1;
        state.sawBanner = true;
        return { kind: "banner", imageUrl: src, title: alt || undefined };
      }
      state.imageIndex += 1;
      return {
        kind: "text_unit",
        imageUrl: src,
        fileUrl: href || "",
        alt: label || undefined,
      };
    }
  }

  // Lone image (banner / image)
  if (isImageOnlyBlock(s)) {
    const img = s.match(/<img\b[^>]*>/i);
    if (img) {
      const { src, alt, width, height } = readImgMeta(img[0]);
      state.imageIndex += 1;
      const firstImage = state.imageIndex === 1 && !state.sawBanner;
      if (looksLikeBanner(src, alt, width, height) || firstImage) {
        state.sawBanner = true;
        return { kind: "banner", imageUrl: src, title: alt || undefined };
      }
      if (looksLikeImageButton(src, alt, width, height)) {
        return {
          kind: "text_unit",
          imageUrl: src,
          fileUrl: "",
          alt: alt || undefined,
        };
      }
      return { kind: "image", imageUrl: src };
    }
  }

  // Text-only link that looks like a CTA
  const onlyLink =
    s.match(/^<p\b[^>]*>\s*<a\b([^>]*)>([\s\S]*?)<\/a>\s*<\/p>$/i) ||
    s.match(/^<a\b([^>]*)>([\s\S]*?)<\/a>$/i);
  if (onlyLink && !/<img\b/i.test(s)) {
    const aTag = `<a ${onlyLink[1]}>`;
    const href = normalizeMediaUrl(attr(aTag, "href"));
    const text = onlyLink[2]!.replace(/<[^>]+>/g, "").trim();
    if (href && text && text.length <= 80) {
      return { kind: "button", text, url: href };
    }
  }

  return { kind: "text", html: s };
}

function push(
  out: MappedComponent[],
  type: MappedComponent["type"],
  props: MappedComponent["props"]
) {
  out.push({ type, position: out.length, props });
}

/**
 * Convert Moodle HTML into an ordered list of CB components.
 * Consecutive text segments are merged.
 */
export function splitMoodleHtmlToComponents(html: string): MappedComponent[] {
  const raw = html?.trim() ?? "";
  if (!raw) return [];

  const segments = splitTopLevelSegments(raw);
  const state = { imageIndex: 0, sawBanner: false };
  const classified = segments.map((seg) => classifySegment(seg, state));

  const out: MappedComponent[] = [];
  let textBuf: string[] = [];

  function flushText() {
    if (textBuf.length === 0) return;
    const merged = textBuf.join("\n");
    textBuf = [];
    if (!isEmptyHtml(merged)) push(out, "text", { html: merged });
  }

  for (const c of classified) {
    if (c.kind === "skip") continue;
    if (c.kind === "text") {
      textBuf.push(c.html);
      continue;
    }
    flushText();
    switch (c.kind) {
      case "banner":
        push(out, "banner", { imageUrl: c.imageUrl, title: c.title });
        break;
      case "image":
        push(out, "image", { imageUrl: c.imageUrl });
        break;
      case "video":
        push(out, "video", {
          url: c.url,
          title: c.title,
          provider: detectVideoProvider(c.url),
        });
        break;
      case "interactive":
        push(out, "interactive_unit", {
          fileUrl: c.url,
          imageUrl: "",
        });
        break;
      case "text_unit":
        push(out, "text_unit", {
          imageUrl: c.imageUrl,
          fileUrl: c.fileUrl,
          notes: c.alt,
        });
        break;
      case "button":
        push(out, "button", { text: c.text, url: c.url, align: "center" });
        break;
    }
  }
  flushText();

  if (out.length === 0 && (!isEmptyHtml(raw) || hasMediaTags(raw))) {
    push(out, "text", { html: raw });
  }

  out.forEach((c, i) => {
    c.position = i;
  });
  return out;
}
