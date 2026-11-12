import { vfsGet } from "./extract";
import { decodeGeneric } from "./decoders/generic";
import { decodeH5P } from "./decoders/h5p";
import { decodeHtmlLike, supportsHtmlLike } from "./decoders/htmlLike";
import { buildFileIndex, type ResolveBlobUrl } from "./resolvePluginfiles";
import { decodeHtmlField } from "./resolvePluginfiles";
import type { BlobStore, MbzActivity, MbzFileRef, MbzManifest, MbzVfs } from "./types";

function cloneManifest(manifest: MbzManifest): MbzManifest {
  return structuredClone(manifest);
}

function materializeBlob(
  vfs: MbzVfs,
  ref: MbzFileRef,
  blobStore: BlobStore
): string {
  if (!blobStore.has(ref.hash)) {
    const bytes = vfsGet(vfs, ref.bucketPath);
    if (bytes) {
      blobStore.set(ref.hash, new Blob([bytes] as BlobPart[], { type: ref.mimetype }));
    } else {
      blobStore.set(ref.hash, new Blob([], { type: ref.mimetype }));
    }
  }
  const blob = blobStore.get(ref.hash)!;
  return URL.createObjectURL(blob);
}

export type BlobUrlCache = Map<string, string>;

export function makeResolveBlobUrl(
  vfs: MbzVfs,
  blobStore: BlobStore,
  urlCache: BlobUrlCache
): ResolveBlobUrl {
  return (ref: MbzFileRef) => {
    const existing = urlCache.get(ref.hash);
    if (existing) return existing;
    const url = materializeBlob(vfs, ref, blobStore);
    urlCache.set(ref.hash, url);
    return url;
  };
}

function needsRedecode(activity: MbzActivity): boolean {
  if (activity.contentStatus === "pending" || !activity.content) return true;
  // Retry earlier failed HTML lookups (wrong activity/page nesting)
  if (
    supportsHtmlLike(activity.type) &&
    activity.content.kind === "raw" &&
    activity.content.note.includes("no HTML field found")
  ) {
    return true;
  }
  // Re-decode if HTML still has raw $@...@$ inside href (old broken replacement)
  if (
    activity.content.kind === "html" &&
    /href=["']\$@[^@]+@\$["']/i.test(activity.content.html)
  ) {
    return true;
  }
  // Re-decode H5P that was decoded before introHtml support
  if (
    activity.type === "hvp" &&
    activity.content.kind === "h5p" &&
    !("introHtml" in activity.content)
  ) {
    return true;
  }
  // Retry H5P that failed JSON parse (old broken unescape path)
  if (
    activity.type === "hvp" &&
    activity.content.kind === "raw" &&
    activity.content.note.includes("failed to parse hvp json_content")
  ) {
    return true;
  }
  // Upgrade TrueFalse that was previously shown as generic JSON
  if (
    activity.type === "hvp" &&
    activity.content.kind === "h5p" &&
    activity.content.machineName === "H5P.TrueFalse" &&
    activity.content.renderer === "generic"
  ) {
    return true;
  }
  return false;
}

function decodeOneActivity(
  vfs: MbzVfs,
  activity: MbzActivity,
  fileIndex: Map<string, MbzFileRef>,
  resolveBlobUrl: ResolveBlobUrl,
  warnings: string[]
): MbzActivity {
  if (!needsRedecode(activity)) return activity;

  let content;
  if (activity.type === "hvp") {
    content = decodeH5P(vfs, activity, fileIndex, resolveBlobUrl);
  } else if (supportsHtmlLike(activity.type)) {
    content = decodeHtmlLike(vfs, activity, fileIndex, resolveBlobUrl);
  } else if (activity.type === "subsection") {
    content = {
      kind: "raw" as const,
      note: "Subsection pointer — open the delegated section for content",
    };
  } else {
    content = decodeGeneric(activity.type);
    warnings.push(`No decoder for activity ${activity.cmid} (${activity.type})`);
  }

  return {
    ...activity,
    contentStatus: "decoded",
    content,
  };
}

/**
 * Single decode entry point for one section (summary + activities).
 * Analyze full course = loop this over all section ids.
 */
export function decodeSection(
  manifest: MbzManifest,
  vfs: MbzVfs,
  sectionId: string,
  blobStore: BlobStore,
  urlCache: BlobUrlCache
): MbzManifest {
  const next = cloneManifest(manifest);
  const section = next.sections.find((s) => s.id === sectionId);
  if (!section) {
    next.warnings.push(`decodeSection: unknown section ${sectionId}`);
    return next;
  }

  const fileIndex = buildFileIndex(next.files);
  const resolveBlobUrl = makeResolveBlobUrl(vfs, blobStore, urlCache);
  const warnings = [...next.warnings];

  if (section.summaryStatus === "pending") {
    if (section.summaryRaw) {
      const { html, referencedFiles } = decodeHtmlField(
        section.summaryRaw,
        fileIndex,
        resolveBlobUrl
      );
      section.summaryHtml = html;
      for (const ref of referencedFiles) {
        materializeBlob(vfs, ref, blobStore);
      }
    } else {
      section.summaryHtml = null;
    }
    section.summaryStatus = "decoded";
  }

  const byCmid = new Map(next.activities.map((a) => [a.cmid, a]));

  for (const cmid of section.activityRefs) {
    const act = byCmid.get(cmid);
    if (!act) continue;
    const decoded = decodeOneActivity(vfs, act, fileIndex, resolveBlobUrl, warnings);
    byCmid.set(cmid, decoded);
  }

  next.activities = next.activities.map((a) => byCmid.get(a.cmid) ?? a);
  next.warnings = warnings;
  return next;
}

/** Decode the first N sections by number order (default 2). */
export function decodeFirstSections(
  manifest: MbzManifest,
  vfs: MbzVfs,
  blobStore: BlobStore,
  urlCache: BlobUrlCache,
  count = 2
): MbzManifest {
  const ordered = [...manifest.sections].sort((a, b) => a.number - b.number);
  let current = manifest;
  for (const section of ordered.slice(0, count)) {
    current = decodeSection(current, vfs, section.id, blobStore, urlCache);
  }
  return current;
}

/** Analyze full course — loops decodeSection only. */
export function decodeAllSections(
  manifest: MbzManifest,
  vfs: MbzVfs,
  blobStore: BlobStore,
  urlCache: BlobUrlCache
): MbzManifest {
  let current = manifest;
  for (const section of [...manifest.sections].sort((a, b) => a.number - b.number)) {
    current = decodeSection(current, vfs, section.id, blobStore, urlCache);
  }
  return current;
}
