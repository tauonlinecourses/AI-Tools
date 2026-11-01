import { XMLParser } from "fast-xml-parser";

export const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  textNodeName: "#text",
  // Only force arrays for *lists* inside moodle_backup / files.xml.
  // Never force the root <section> of section.xml into an array — that
  // breaks number/name/sequence reads (everything becomes "Section 0").
  isArray: (name, jpath) => {
    const path = typeof jpath === "string" ? jpath : String(jpath ?? "");
    if (name === "file" || name === "setting") return true;
    if (name === "activity" && path.includes("activities")) return true;
    if (name === "section" && path.includes("contents.sections")) return true;
    return false;
  },
  trimValues: false,
});

export function asArray<T>(value: T | T[] | undefined | null): T[] {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

export function textOf(node: unknown): string {
  if (node == null) return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (typeof node === "object" && node !== null && "#text" in node) {
    return String((node as { "#text": unknown })["#text"] ?? "");
  }
  return "";
}

export function moodleNull(value: string): string | null {
  const v = value.trim();
  if (!v || v === "$@NULL@$") return null;
  return v;
}

export function unescapeXmlEntities(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

export function unescapeHtmlEntities(s: string): string {
  // Same entity set; applied to H5P inner strings after JSON.parse
  return unescapeXmlEntities(s);
}
