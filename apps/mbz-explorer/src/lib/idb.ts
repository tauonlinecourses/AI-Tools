import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { MbzManifest, MbzVfs } from "./mbz-parser";

interface MbzDb extends DBSchema {
  analyses: {
    key: string;
    value: {
      sha1: string;
      name: string;
      sizeBytes: number;
      createdAt: number;
      updatedAt: number;
      manifest: MbzManifest;
    };
  };
  vfsChunks: {
    key: string;
    value: {
      sha1: string;
      path: string;
      data: Uint8Array;
    };
    indexes: { "by-sha1": string };
  };
  blobs: {
    key: string;
    value: {
      sha1: string;
      hash: string;
      mimetype: string;
      data: Blob;
    };
    indexes: { "by-sha1": string };
  };
}

const DB_NAME = "mbz-explorer";
const DB_VERSION = 1;

let dbPromise: Promise<IDBPDatabase<MbzDb>> | null = null;

function getDb() {
  if (!dbPromise) {
    dbPromise = openDB<MbzDb>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        db.createObjectStore("analyses", { keyPath: "sha1" });
        const vfs = db.createObjectStore("vfsChunks", { keyPath: ["sha1", "path"] });
        vfs.createIndex("by-sha1", "sha1");
        const blobs = db.createObjectStore("blobs", { keyPath: ["sha1", "hash"] });
        blobs.createIndex("by-sha1", "sha1");
      },
    });
  }
  return dbPromise;
}

export interface AnalysisSummary {
  sha1: string;
  name: string;
  sizeBytes: number;
  createdAt: number;
  updatedAt: number;
  courseName: string;
  sectionCount: number;
  activityCount: number;
  fileCount: number;
  activityTypeCounts: Record<string, number>;
}

export async function listAnalyses(): Promise<AnalysisSummary[]> {
  const db = await getDb();
  const all = await db.getAll("analyses");
  return all
    .map((row) => {
      const counts: Record<string, number> = {};
      for (const a of row.manifest.activities) {
        counts[a.type] = (counts[a.type] || 0) + 1;
      }
      return {
        sha1: row.sha1,
        name: row.name,
        sizeBytes: row.sizeBytes,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        courseName: row.manifest.course.fullname,
        sectionCount: row.manifest.sections.length,
        activityCount: row.manifest.activities.length,
        fileCount: row.manifest.files.length,
        activityTypeCounts: counts,
      };
    })
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function getAnalysis(
  sha1: string
): Promise<{ manifest: MbzManifest; vfs: MbzVfs } | null> {
  const db = await getDb();
  const row = await db.get("analyses", sha1);
  if (!row) return null;

  const vfsEntries = await db.getAllFromIndex("vfsChunks", "by-sha1", sha1);
  const vfs: MbzVfs = new Map();
  for (const e of vfsEntries) {
    vfs.set(e.path, e.data);
  }
  return { manifest: row.manifest, vfs };
}

export async function saveAnalysis(
  manifest: MbzManifest,
  vfs: MbzVfs,
  opts?: { persistFullVfs?: boolean }
): Promise<void> {
  const db = await getDb();
  const now = Date.now();
  const existing = await db.get("analyses", manifest.sourceFile.sha1);
  await db.put("analyses", {
    sha1: manifest.sourceFile.sha1,
    name: manifest.sourceFile.name,
    sizeBytes: manifest.sourceFile.sizeBytes,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    manifest,
  });

  if (opts?.persistFullVfs !== false) {
    const tx = db.transaction("vfsChunks", "readwrite");
    // Clear old vfs for this sha1 then rewrite
    const old = await tx.store.index("by-sha1").getAllKeys(manifest.sourceFile.sha1);
    for (const key of old) {
      await tx.store.delete(key);
    }
    for (const [path, data] of vfs) {
      await tx.store.put({ sha1: manifest.sourceFile.sha1, path, data });
    }
    await tx.done;
  }
}

export async function updateManifest(manifest: MbzManifest): Promise<void> {
  const db = await getDb();
  const existing = await db.get("analyses", manifest.sourceFile.sha1);
  if (!existing) return;
  await db.put("analyses", {
    ...existing,
    updatedAt: Date.now(),
    manifest,
  });
}

export async function deleteAnalysis(sha1: string): Promise<void> {
  const db = await getDb();
  await db.delete("analyses", sha1);

  const vfsTx = db.transaction("vfsChunks", "readwrite");
  const vfsKeys = await vfsTx.store.index("by-sha1").getAllKeys(sha1);
  for (const key of vfsKeys) await vfsTx.store.delete(key);
  await vfsTx.done;

  const blobTx = db.transaction("blobs", "readwrite");
  const blobKeys = await blobTx.store.index("by-sha1").getAllKeys(sha1);
  for (const key of blobKeys) await blobTx.store.delete(key);
  await blobTx.done;
}
