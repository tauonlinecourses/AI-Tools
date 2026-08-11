import type { BlobUrlCache } from "./mbz-parser";

/** Revoke all object URLs in a cache and clear it. */
export function revokeBlobUrls(cache: BlobUrlCache): void {
  for (const url of cache.values()) {
    try {
      URL.revokeObjectURL(url);
    } catch {
      /* ignore */
    }
  }
  cache.clear();
}
