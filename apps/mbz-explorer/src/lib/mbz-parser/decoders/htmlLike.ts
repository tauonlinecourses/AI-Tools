import { vfsText } from "../extract";
import { decodeHtmlField } from "../resolvePluginfiles";
import type { MbzActivity, MbzActivityContent, MbzFileRef, MbzVfs } from "../types";
import type { ResolveBlobUrl } from "../resolvePluginfiles";
import { asArray, xmlParser } from "../xml";

const HTML_TYPES = new Set(["page", "resource", "label", "book", "url"]);

/** Field preference per module type (first non-empty wins). */
const FIELD_PREFERENCE: Record<string, string[]> = {
  page: ["content", "intro"],
  label: ["intro", "content"],
  resource: ["intro", "content"],
  url: ["externalurl", "intro", "content"],
  book: ["intro", "content"],
};

/**
 * Moodle activity XML is usually:
 *   <activity …><page id="…"><content>…</content></page></activity>
 * The payload root may also be bare <page>…</page>.
 */
function getTypedRoot(doc: Record<string, unknown>, type: string): Record<string, unknown> {
  const direct = doc[type];
  if (direct && typeof direct === "object" && !Array.isArray(direct)) {
    return direct as Record<string, unknown>;
  }
  if (Array.isArray(direct) && direct[0] && typeof direct[0] === "object") {
    return direct[0] as Record<string, unknown>;
  }

  const activity = doc.activity;
  if (activity && typeof activity === "object") {
    const act = activity as Record<string, unknown>;
    const nested = act[type];
    if (nested && typeof nested === "object" && !Array.isArray(nested)) {
      return nested as Record<string, unknown>;
    }
    if (Array.isArray(nested) && nested[0] && typeof nested[0] === "object") {
      return nested[0] as Record<string, unknown>;
    }
    // Sometimes fields sit directly under <activity>
    return act;
  }

  return doc;
}

/** Pull string value from a node that may be text, #text object, or nested junk. */
function fieldText(node: unknown): string {
  if (node == null) return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (typeof node === "object") {
    const o = node as Record<string, unknown>;
    if ("#text" in o) return String(o["#text"] ?? "");
    // Unescaped HTML parsed into nested tags — reconstruct a rough HTML string
    return objectToHtmlish(o);
  }
  return "";
}

function objectToHtmlish(obj: Record<string, unknown>): string {
  const parts: string[] = [];
  for (const [key, val] of Object.entries(obj)) {
    if (key.startsWith("@_")) continue;
    if (key === "#text") {
      parts.push(String(val ?? ""));
      continue;
    }
    for (const child of asArray(val)) {
      if (child == null) continue;
      if (typeof child === "string" || typeof child === "number") {
        parts.push(`<${key}>${child}</${key}>`);
      } else if (typeof child === "object") {
        const inner = objectToHtmlish(child as Record<string, unknown>);
        parts.push(`<${key}>${inner}</${key}>`);
      }
    }
  }
  return parts.join("");
}

/**
 * Regex fallback: read tag body from raw XML (handles entity-escaped HTML
 * that fast-xml-parser may mishandle).
 */
function extractTagRaw(xml: string, tag: string): string | null {
  const re = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, "i");
  // Prefer the innermost payload tag under the module element — scan all matches, take last non-empty
  // (activity wrapper shouldn't contain these as top-level siblings usually once)
  const matches = xml.match(new RegExp(re.source, "gi"));
  if (!matches?.length) return null;
  for (let i = matches.length - 1; i >= 0; i--) {
    const m = matches[i].match(re);
    const body = m?.[1]?.trim() ?? "";
    if (body && body !== "$@NULL@$") return body;
  }
  return null;
}

function findHtmlPayload(
  doc: Record<string, unknown>,
  rawXml: string,
  type: string
): string | null {
  const typed = getTypedRoot(doc, type);
  const fields = FIELD_PREFERENCE[type] ?? ["content", "intro", "summary", "externalurl"];

  for (const key of fields) {
    const v = fieldText(typed[key]).trim();
    if (v && v !== "$@NULL@$") return v;
  }

  // book chapters
  const chapters = typed.chapters ?? typed.chapter;
  if (chapters) {
    for (const ch of asArray(chapters)) {
      if (!ch || typeof ch !== "object") continue;
      const c = fieldText((ch as { content?: unknown }).content).trim();
      if (c) return c;
    }
  }

  // Raw XML fallback (most reliable for Moodle entity-escaped <content>)
  for (const key of fields) {
    const raw = extractTagRaw(rawXml, key);
    if (raw) return raw;
  }

  return null;
}

export function decodeHtmlLike(
  vfs: MbzVfs,
  activity: MbzActivity,
  fileIndex: Map<string, MbzFileRef>,
  resolveBlobUrl: ResolveBlobUrl
): MbzActivityContent {
  const raw = vfsText(vfs, activity.rawXmlPath);
  if (!raw) {
    return { kind: "raw", note: `missing payload XML at ${activity.rawXmlPath}` };
  }
  const doc = xmlParser.parse(raw) as Record<string, unknown>;
  const htmlEscaped = findHtmlPayload(doc, raw, activity.type);
  if (!htmlEscaped) {
    return { kind: "raw", note: `no HTML field found for type: ${activity.type}` };
  }
  const { html, referencedFiles, unresolvedTokens } = decodeHtmlField(
    htmlEscaped,
    fileIndex,
    resolveBlobUrl
  );
  return { kind: "html", html, referencedFiles, unresolvedTokens };
}

export function supportsHtmlLike(type: string): boolean {
  return HTML_TYPES.has(type);
}
