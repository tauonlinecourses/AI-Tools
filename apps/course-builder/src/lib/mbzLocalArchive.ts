/**
 * Browser IndexedDB store for large original .mbz archives when Supabase Storage
 * rejects the upload (size limits). Export still works on the same browser/profile.
 */

const DB_NAME = "course-builder-mbz";
const DB_VERSION = 1;
const STORE = "archives";

interface ArchiveRow {
  courseId: string;
  blob: Blob;
  filename: string;
  sha1: string;
  savedAt: number;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error ?? new Error("IndexedDB open failed"));
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "courseId" });
      }
    };
    req.onsuccess = () => resolve(req.result);
  });
}

function idbReq<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("IndexedDB request failed"));
  });
}

export async function saveLocalMbzArchive(
  courseId: string,
  bytes: ArrayBuffer,
  meta: { filename: string; sha1: string }
): Promise<void> {
  const db = await openDb();
  try {
    const tx = db.transaction(STORE, "readwrite");
    const copy = new Uint8Array(bytes.byteLength);
    copy.set(new Uint8Array(bytes));
    const row: ArchiveRow = {
      courseId,
      blob: new Blob([copy], { type: "application/octet-stream" }),
      filename: meta.filename,
      sha1: meta.sha1,
      savedAt: Date.now(),
    };
    await idbReq(tx.objectStore(STORE).put(row));
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error("IndexedDB write failed"));
    });
  } finally {
    db.close();
  }
}

export async function loadLocalMbzArchive(courseId: string): Promise<ArrayBuffer | null> {
  const db = await openDb();
  try {
    const tx = db.transaction(STORE, "readonly");
    const row = await idbReq(tx.objectStore(STORE).get(courseId));
    if (!row?.blob) return null;
    return row.blob.arrayBuffer();
  } finally {
    db.close();
  }
}

export async function deleteLocalMbzArchive(courseId: string): Promise<void> {
  const db = await openDb();
  try {
    const tx = db.transaction(STORE, "readwrite");
    await idbReq(tx.objectStore(STORE).delete(courseId));
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error("IndexedDB delete failed"));
    });
  } finally {
    db.close();
  }
}
