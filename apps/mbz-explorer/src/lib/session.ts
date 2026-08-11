import {
  buildManifest,
  decodeAllSections,
  decodeFirstSections,
  decodeSection,
  extract,
  type BlobStore,
  type BlobUrlCache,
  type MbzManifest,
  type MbzVfs,
} from "./mbz-parser";
import { revokeBlobUrls } from "./blobUrls";
import * as idb from "./idb";

export interface SessionState {
  manifest: MbzManifest;
  vfs: MbzVfs;
  blobStore: BlobStore;
  urlCache: BlobUrlCache;
}

const sessions = new Map<string, SessionState>();

export function getSession(sha1: string): SessionState | undefined {
  return sessions.get(sha1);
}

export function setSession(state: SessionState): void {
  sessions.set(state.manifest.sourceFile.sha1, state);
}

function htmlDecodeLooksBroken(manifest: MbzManifest): boolean {
  return manifest.activities.some(
    (a) =>
      a.contentStatus === "decoded" &&
      a.content?.kind === "raw" &&
      (a.content.note.includes("no HTML field found") ||
        a.content.note.includes("failed to parse hvp json_content"))
  );
}

function h5pNeedsIntroUpgrade(manifest: MbzManifest): boolean {
  return manifest.activities.some(
    (a) =>
      a.type === "hvp" &&
      a.contentStatus === "decoded" &&
      a.content?.kind === "h5p" &&
      !("introHtml" in a.content)
  );
}

function sectionsLookBroken(manifest: MbzManifest): boolean {
  if (manifest.sections.length === 0) return true;
  // Legacy bug: isArray forced root <section> into [], yielding "0. Section 0" + empty sequences
  const allZeroNamed = manifest.sections.every(
    (s) => s.number === 0 && (s.name === "Section 0" || !s.name.trim())
  );
  const noActivitiesLinked = manifest.sections.every((s) => s.activityRefs.length === 0);
  return allZeroNamed || (noActivitiesLinked && manifest.activities.length > 0);
}

function shouldRepair(manifest: MbzManifest): boolean {
  return sectionsLookBroken(manifest) || htmlDecodeLooksBroken(manifest) || h5pNeedsIntroUpgrade(manifest);
}

export async function ingestFile(file: File): Promise<SessionState> {
  const buffer = await file.arrayBuffer();
  const { vfs, sha1 } = await extract(buffer);

  const cached = await idb.getAnalysis(sha1);
  if (cached && cached.vfs.size > 0 && !shouldRepair(cached.manifest)) {
    const blobStore: BlobStore = new Map();
    const urlCache: BlobUrlCache = new Map();
    const state: SessionState = {
      manifest: cached.manifest,
      vfs: cached.vfs,
      blobStore,
      urlCache,
    };
    setSession(state);
    return state;
  }

  const useVfs = cached?.vfs.size ? cached.vfs : vfs;
  let manifest = buildManifest(useVfs, {
    name: file.name,
    sha1,
    sizeBytes: file.size,
  });

  const blobStore: BlobStore = new Map();
  const urlCache: BlobUrlCache = new Map();

  // Default: decode first 2 sections
  manifest = decodeFirstSections(manifest, useVfs, blobStore, urlCache, 2);

  await idb.saveAnalysis(manifest, useVfs);

  const state: SessionState = { manifest, vfs: useVfs, blobStore, urlCache };
  setSession(state);
  return state;
}

export async function loadSession(sha1: string): Promise<SessionState | null> {
  const existing = sessions.get(sha1);
  if (existing) {
    if (!shouldRepair(existing.manifest)) return existing;
    sessions.delete(sha1);
  }

  const cached = await idb.getAnalysis(sha1);
  if (!cached || cached.vfs.size === 0) return null;

  let manifest = cached.manifest;
  const blobStore: BlobStore = new Map();
  const urlCache: BlobUrlCache = new Map();

  if (shouldRepair(manifest)) {
    if (sectionsLookBroken(manifest)) {
      manifest = buildManifest(cached.vfs, {
        name: cached.manifest.sourceFile.name,
        sha1: cached.manifest.sourceFile.sha1,
        sizeBytes: cached.manifest.sourceFile.sizeBytes,
      });
    }
    // Re-run first-2 decode (also retries failed HTML field lookups via needsRedecode)
    manifest = decodeFirstSections(manifest, cached.vfs, blobStore, urlCache, 2);
    // Also re-decode any other sections that already had failed page lookups / stale H5P
    const repairCmids = new Set(
      [...manifest.activities, ...cached.manifest.activities]
        .filter(
          (a) =>
            (a.content?.kind === "raw" &&
              (a.content.note.includes("no HTML field found") ||
                a.content.note.includes("failed to parse hvp json_content"))) ||
            (a.type === "hvp" && a.content?.kind === "h5p" && !("introHtml" in a.content))
        )
        .map((a) => a.cmid)
    );
    if (repairCmids.size > 0) {
      for (const section of manifest.sections) {
        if (section.activityRefs.some((id) => repairCmids.has(id))) {
          manifest = decodeSection(manifest, cached.vfs, section.id, blobStore, urlCache);
        }
      }
    }
    await idb.saveAnalysis(manifest, cached.vfs);
  }

  const state: SessionState = {
    manifest,
    vfs: cached.vfs,
    blobStore,
    urlCache,
  };
  setSession(state);
  return state;
}

export async function runDecodeSection(
  sha1: string,
  sectionId: string
): Promise<MbzManifest | null> {
  const session = sessions.get(sha1);
  if (!session) return null;
  const manifest = decodeSection(
    session.manifest,
    session.vfs,
    sectionId,
    session.blobStore,
    session.urlCache
  );
  session.manifest = manifest;
  await idb.updateManifest(manifest);
  return manifest;
}

export async function runDecodeAll(sha1: string): Promise<MbzManifest | null> {
  const session = sessions.get(sha1);
  if (!session) return null;
  const manifest = decodeAllSections(
    session.manifest,
    session.vfs,
    session.blobStore,
    session.urlCache
  );
  session.manifest = manifest;
  await idb.updateManifest(manifest);
  return manifest;
}

/** Force re-decode a section (resets its activities to pending first). */
export async function runForceRedecode(
  sha1: string,
  sectionId: string
): Promise<MbzManifest | null> {
  const session = sessions.get(sha1);
  if (!session) return null;
  const section = session.manifest.sections.find((s) => s.id === sectionId);
  if (!section) return null;

  // Reset activities in this section to pending so decodeSection re-runs decoders
  const updated = {
    ...session.manifest,
    sections: session.manifest.sections.map((s) =>
      s.id === sectionId ? { ...s, summaryStatus: "pending" as const, summaryHtml: null } : s
    ),
    activities: session.manifest.activities.map((a) =>
      section.activityRefs.includes(a.cmid)
        ? { ...a, contentStatus: "pending" as const, content: null }
        : a
    ),
  };

  const manifest = decodeSection(
    updated,
    session.vfs,
    sectionId,
    session.blobStore,
    session.urlCache
  );
  session.manifest = manifest;
  await idb.updateManifest(manifest);
  return manifest;
}

export async function removeAnalysis(sha1: string): Promise<void> {
  const session = sessions.get(sha1);
  if (session) {
    revokeBlobUrls(session.urlCache);
    sessions.delete(sha1);
  }
  await idb.deleteAnalysis(sha1);
}

export { listAnalyses } from "./idb";
export type { AnalysisSummary } from "./idb";
