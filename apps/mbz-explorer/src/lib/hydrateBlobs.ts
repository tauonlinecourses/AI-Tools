import type { BlobStore, MbzFileRef, MbzManifest, MbzVfs } from "./mbz-parser/types";
import { vfsGet } from "./mbz-parser/extract";
import type { BlobUrlCache } from "./mbz-parser/decodeSection";

/** Ensure blob exists and return object URL for a content hash. */
export function ensureBlobUrl(
  vfs: MbzVfs,
  files: MbzFileRef[],
  hash: string,
  blobStore: BlobStore,
  urlCache: BlobUrlCache
): string | null {
  const cached = urlCache.get(hash);
  if (cached) return cached;
  const ref = files.find((f) => f.hash === hash);
  if (!ref) return null;
  if (!blobStore.has(hash)) {
    const bytes = vfsGet(vfs, ref.bucketPath);
    blobStore.set(hash, new Blob([bytes ?? new Uint8Array()] as BlobPart[], { type: ref.mimetype }));
  }
  const url = URL.createObjectURL(blobStore.get(hash)!);
  urlCache.set(hash, url);
  return url;
}

/** Rewrite mbz-blob:<hash> placeholders to live blob: URLs for rendering. */
export function hydrateHtmlBlobs(
  html: string,
  manifest: MbzManifest,
  vfs: MbzVfs,
  blobStore: BlobStore,
  urlCache: BlobUrlCache
): string {
  return html.replace(/mbz-blob:([a-f0-9]+)/gi, (_m, hash: string) => {
    return ensureBlobUrl(vfs, manifest.files, hash, blobStore, urlCache) ?? _m;
  });
}
