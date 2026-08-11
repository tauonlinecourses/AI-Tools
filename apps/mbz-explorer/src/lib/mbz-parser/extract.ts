import { gunzipSync, unzipSync } from "fflate";
import JSZip from "jszip";
import type { MbzVfs } from "./types";

const GZIP_MAGIC = [0x1f, 0x8b];
const ZIP_MAGIC = [0x50, 0x4b]; // PK

function isGzip(bytes: Uint8Array): boolean {
  return bytes.length >= 2 && bytes[0] === GZIP_MAGIC[0] && bytes[1] === GZIP_MAGIC[1];
}

function isZip(bytes: Uint8Array): boolean {
  return bytes.length >= 2 && bytes[0] === ZIP_MAGIC[0] && bytes[1] === ZIP_MAGIC[1];
}

function normalizePath(path: string): string {
  return path.replace(/\\/g, "/").replace(/^\.\//, "").replace(/\/+/g, "/");
}

/** Minimal ustar/pax-aware tar parser → VFS */
function parseTar(tar: Uint8Array): MbzVfs {
  const vfs: MbzVfs = new Map();
  let offset = 0;
  let pendingLongName: string | null = null;

  const decoder = new TextDecoder("utf-8");

  const readString = (start: number, len: number): string => {
    const slice = tar.subarray(start, start + len);
    let end = slice.indexOf(0);
    if (end < 0) end = len;
    return decoder.decode(slice.subarray(0, end)).trim();
  };

  const readOctal = (start: number, len: number): number => {
    const raw = readString(start, len).replace(/\0/g, "").trim();
    if (!raw) return 0;
    return parseInt(raw, 8) || 0;
  };

  while (offset + 512 <= tar.length) {
    const header = tar.subarray(offset, offset + 512);
    // End of archive: two zero blocks
    if (header.every((b) => b === 0)) break;

    const size = readOctal(offset + 124, 12);
    const typeflag = String.fromCharCode(header[156] ?? 0);
    let name = readString(offset + 0, 100);
    const prefix = readString(offset + 345, 155);
    if (prefix) name = `${prefix}/${name}`;

    if (pendingLongName) {
      name = pendingLongName;
      pendingLongName = null;
    }

    offset += 512;
    const dataEnd = offset + size;
    const data = tar.subarray(offset, Math.min(dataEnd, tar.length));
    // Pad to 512
    offset = dataEnd + ((512 - (size % 512)) % 512);

    if (typeflag === "L" || typeflag === "K") {
      // GNU long name / link
      pendingLongName = decoder.decode(data).replace(/\0/g, "").trim();
      continue;
    }

    if (typeflag === "x" || typeflag === "g") {
      // Pax header — parse path= if present
      const text = decoder.decode(data);
      const pathMatch = text.match(/(?:^|\n)\d+ path=(.+?)(?:\n|$)/);
      if (pathMatch?.[1]) pendingLongName = pathMatch[1].trim();
      continue;
    }

    // Regular file (0 or '\0') or contiguous
    if (typeflag === "0" || typeflag === "\0" || typeflag === "") {
      const path = normalizePath(name);
      if (path && !path.endsWith("/")) {
        vfs.set(path, new Uint8Array(data));
      }
    }
  }

  return vfs;
}

async function extractZip(bytes: Uint8Array): Promise<MbzVfs> {
  try {
    const unzipped = unzipSync(bytes);
    const vfs: MbzVfs = new Map();
    for (const [name, data] of Object.entries(unzipped)) {
      const path = normalizePath(name);
      if (path && !path.endsWith("/") && data) vfs.set(path, data);
    }
    return vfs;
  } catch {
    // Fallback to JSZip for odd zip variants
    const zip = await JSZip.loadAsync(bytes);
    const vfs: MbzVfs = new Map();
    const entries = Object.keys(zip.files);
    for (const name of entries) {
      const file = zip.files[name];
      if (!file || file.dir) continue;
      const path = normalizePath(name);
      const data = await file.async("uint8array");
      vfs.set(path, data);
    }
    return vfs;
  }
}

export async function sha1Hex(buffer: ArrayBuffer): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-1", buffer);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function extract(
  buffer: ArrayBuffer
): Promise<{ vfs: MbzVfs; sha1: string }> {
  const bytes = new Uint8Array(buffer);
  const sha1 = await sha1Hex(buffer);

  let vfs: MbzVfs;
  if (isGzip(bytes)) {
    const tar = gunzipSync(bytes);
    vfs = parseTar(tar);
  } else if (isZip(bytes)) {
    vfs = await extractZip(bytes);
  } else {
    // Some .mbz are plain tar
    vfs = parseTar(bytes);
  }

  // If archive had a single top-level folder, keep paths as-is (Moodle usually flat root)
  return { vfs, sha1 };
}

export function vfsText(vfs: MbzVfs, path: string): string | null {
  const data = vfsGet(vfs, path);
  if (!data) return null;
  return new TextDecoder("utf-8").decode(data);
}

/** Case-insensitive / slash-normalized lookup */
export function vfsGet(vfs: MbzVfs, path: string): Uint8Array | null {
  const norm = normalizePath(path);
  if (vfs.has(norm)) return vfs.get(norm)!;
  const lower = norm.toLowerCase();
  for (const [k, v] of vfs) {
    if (k.toLowerCase() === lower) return v;
  }
  return null;
}

export function vfsListPrefix(vfs: MbzVfs, prefix: string): string[] {
  const p = normalizePath(prefix).replace(/\/$/, "") + "/";
  const out: string[] = [];
  for (const key of vfs.keys()) {
    if (key.startsWith(p) || key === prefix.replace(/\/$/, "")) out.push(key);
  }
  return out;
}
