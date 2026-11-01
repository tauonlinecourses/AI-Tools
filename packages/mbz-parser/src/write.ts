import { gzipSync, zipSync, strToU8 } from "fflate";
import type { ArchiveKind } from "./extract";
import type { MbzVfs } from "./types";

function escapeXmlText(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** Encode a path name into ustar header fields (name + optional prefix). */
function tarNameParts(path: string): { name: string; prefix: string } {
  if (path.length <= 100) return { name: path, prefix: "" };
  // Split on a slash so name ≤ 100 and prefix ≤ 155
  for (let i = path.length - 1; i >= 0; i--) {
    if (path[i] !== "/") continue;
    const prefix = path.slice(0, i);
    const name = path.slice(i + 1);
    if (prefix.length <= 155 && name.length <= 100) {
      return { name, prefix };
    }
  }
  // Fallback: truncate (rare for Moodle backups)
  return { name: path.slice(-100), prefix: path.slice(0, Math.min(155, path.length - 100)) };
}

function writeAscii(buf: Uint8Array, offset: number, value: string, len: number): void {
  for (let i = 0; i < len; i++) {
    buf[offset + i] = i < value.length ? value.charCodeAt(i) & 0xff : 0;
  }
}

function writeOctal(buf: Uint8Array, offset: number, value: number, len: number): void {
  const s = value.toString(8).padStart(len - 1, "0");
  writeAscii(buf, offset, s, len - 1);
  buf[offset + len - 1] = 0;
}

function checksumHeader(header: Uint8Array): number {
  let sum = 0;
  for (let i = 0; i < 512; i++) sum += header[i] ?? 0;
  return sum;
}

function createTarHeader(path: string, size: number, mtimeSec: number): Uint8Array {
  const header = new Uint8Array(512);
  const { name, prefix } = tarNameParts(path);
  writeAscii(header, 0, name, 100);
  writeOctal(header, 100, 0o644, 8); // mode
  writeOctal(header, 108, 0, 8); // uid
  writeOctal(header, 116, 0, 8); // gid
  writeOctal(header, 124, size, 12);
  writeOctal(header, 136, mtimeSec, 12);
  writeAscii(header, 148, "        ", 8); // checksum placeholder (spaces)
  header[156] = "0".charCodeAt(0); // regular file
  writeAscii(header, 257, "ustar", 6);
  writeAscii(header, 263, "00", 2);
  if (prefix) writeAscii(header, 345, prefix, 155);

  const sum = checksumHeader(header);
  const sumStr = sum.toString(8).padStart(6, "0") + "\0 ";
  writeAscii(header, 148, sumStr, 8);
  return header;
}

function buildTar(vfs: MbzVfs): Uint8Array {
  const mtimeSec = Math.floor(Date.now() / 1000);
  const parts: Uint8Array[] = [];
  const paths = [...vfs.keys()].sort();

  for (const path of paths) {
    const data = vfs.get(path);
    if (!data) continue;
    parts.push(createTarHeader(path, data.length, mtimeSec));
    parts.push(data);
    const pad = (512 - (data.length % 512)) % 512;
    if (pad) parts.push(new Uint8Array(pad));
  }

  // Two zero blocks end the archive
  parts.push(new Uint8Array(1024));

  let total = 0;
  for (const p of parts) total += p.length;
  const out = new Uint8Array(total);
  let offset = 0;
  for (const p of parts) {
    out.set(p, offset);
    offset += p.length;
  }
  return out;
}

/**
 * Pack a VFS back into an .mbz-compatible archive.
 * Prefer matching the original `archiveKind` from extract().
 */
export function vfsToMbz(
  vfs: MbzVfs,
  options: { format?: ArchiveKind } = {}
): Uint8Array {
  const format = options.format ?? "tgz";
  if (format === "zip") {
    const files: Record<string, Uint8Array> = {};
    for (const [path, data] of vfs) {
      files[path] = data;
    }
    return zipSync(files, { level: 6 });
  }

  const tar = buildTar(vfs);
  if (format === "tar") return tar;
  return gzipSync(tar, { level: 6 });
}

/**
 * Replace the text body of the first matching XML tag (case-insensitive).
 * Escapes the new value for safe embedding as XML text content.
 * Returns null if the tag was not found.
 */
export function patchXmlTagBody(
  xml: string,
  tag: string,
  newValue: string,
  options: { escape?: boolean } = {}
): string | null {
  const escape = options.escape !== false;
  const body = escape ? escapeXmlText(newValue) : newValue;
  const re = new RegExp(`(<${tag}(?:\\s[^>]*)?>)([\\s\\S]*?)(</${tag}>)`, "i");
  if (!re.test(xml)) return null;
  return xml.replace(re, `$1${body}$3`);
}

/** Patch a named field inside an activity payload XML string. */
export function patchActivityXmlField(
  xml: string,
  field: string,
  newValue: string
): string {
  const patched = patchXmlTagBody(xml, field, newValue, { escape: true });
  if (patched == null) {
    throw new Error(`Could not find <${field}> in activity XML to patch`);
  }
  return patched;
}

/** Patch <name> in section.xml. */
export function patchSectionName(xml: string, name: string): string {
  const patched = patchXmlTagBody(xml, "name", name, { escape: true });
  if (patched == null) {
    throw new Error("Could not find <name> in section.xml to patch");
  }
  return patched;
}

/** Patch <sequence> in section.xml (comma-separated cmids). */
export function patchSectionSequence(xml: string, cmids: string[]): string {
  const patched = patchXmlTagBody(xml, "sequence", cmids.join(","), { escape: false });
  if (patched == null) {
    throw new Error("Could not find <sequence> in section.xml to patch");
  }
  return patched;
}

/**
 * Rebuild a section sequence after CB reorder/delete.
 *
 * - `orderedEditableCmids`: current CB page order for editable activities in this section
 * - `originalSequence`: original Moodle sequence (may include unsupported + subsection cmids)
 * - `removedEditableCmids`: editable cmids that were deleted in CB (soft-omit)
 *
 * Unsupported / subsection cmids keep their relative slots among remaining items:
 * walk the original sequence; when hitting an editable cmid, emit the next unused
 * editable from `orderedEditableCmids`; when hitting a preserved cmid, emit it if
 * not removed.
 */
export function rebuildSequence(args: {
  orderedEditableCmids: string[];
  originalSequence: string[];
  removedEditableCmids?: Iterable<string>;
  editableCmidSet: Set<string>;
}): string[] {
  const removed = new Set(args.removedEditableCmids ?? []);
  const pendingEditable = args.orderedEditableCmids.filter((c) => !removed.has(c));
  let editIdx = 0;
  const out: string[] = [];
  const seen = new Set<string>();

  for (const cmid of args.originalSequence) {
    if (removed.has(cmid)) continue;
    if (args.editableCmidSet.has(cmid)) {
      const next = pendingEditable[editIdx];
      if (next && !seen.has(next)) {
        out.push(next);
        seen.add(next);
        editIdx += 1;
      }
      continue;
    }
    if (!seen.has(cmid)) {
      out.push(cmid);
      seen.add(cmid);
    }
  }

  // Append any remaining editable cmids (e.g. moved to end) that were not placed
  while (editIdx < pendingEditable.length) {
    const cmid = pendingEditable[editIdx++]!;
    if (!seen.has(cmid)) {
      out.push(cmid);
      seen.add(cmid);
    }
  }

  return out;
}

/** Convenience: encode string to Uint8Array for VFS writes. */
export function encodeVfsText(text: string): Uint8Array {
  return strToU8(text);
}
