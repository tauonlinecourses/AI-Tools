import type { ArchiveKind } from "@workspace/mbz-parser";
import { supabase } from "./supabase";
import type { CourseMbzBinding, CourseMbzSource, MbzStorageBackend } from "./mbzTypes";
import {
  deleteLocalMbzArchive,
  loadLocalMbzArchive,
  saveLocalMbzArchive,
} from "./mbzLocalArchive";

export const MBZ_STORAGE_BUCKET = "course-mbz";

/** Skip Supabase upload above this size — common project limits are ~50MB. */
export const MBZ_SUPABASE_UPLOAD_MAX_BYTES = 40 * 1024 * 1024;

function fail(message: string): never {
  throw new Error(message);
}

export function mbzStoragePath(courseId: string): string {
  return `${courseId}/source.mbz`;
}

export function mbzIdbStoragePath(courseId: string): string {
  return `idb:${courseId}`;
}

function isSizeLimitError(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes("maximum allowed size") ||
    m.includes("entity too large") ||
    m.includes("payload too large") ||
    m.includes("exceeded") ||
    m.includes("too large") ||
    m.includes("413")
  );
}

export interface PersistMbzArchiveResult {
  storage_path: string;
  storage_backend: MbzStorageBackend;
  /** True when bytes were kept in IndexedDB because Storage rejected or skipped them. */
  usedLocalFallback: boolean;
}

/**
 * Persist the original archive for later export.
 * Tries Supabase Storage for smaller files; large files (or size-limit failures)
 * go to IndexedDB on this browser.
 */
export async function persistMbzArchive(
  courseId: string,
  bytes: ArrayBuffer,
  meta: { filename: string; sha1: string },
  onProgress?: (message: string) => void
): Promise<PersistMbzArchiveResult> {
  const preferLocal = bytes.byteLength > MBZ_SUPABASE_UPLOAD_MAX_BYTES;

  if (!preferLocal) {
    onProgress?.("מעלה את קובץ ה-MBZ לשרת…");
    const path = mbzStoragePath(courseId);
    const { error } = await supabase.storage
      .from(MBZ_STORAGE_BUCKET)
      .upload(path, bytes, { contentType: "application/octet-stream", upsert: true });
    if (!error) {
      return { storage_path: path, storage_backend: "supabase", usedLocalFallback: false };
    }
    if (!isSizeLimitError(error.message)) {
      fail(`העלאת קובץ MBZ נכשלה: ${error.message}`);
    }
    onProgress?.("הקובץ גדול מדי לשרת — שומר מקומית בדפדפן…");
  } else {
    onProgress?.(
      `הקובץ גדול (${Math.round(bytes.byteLength / (1024 * 1024))}MB) — שומר מקומית בדפדפן לייצוא MBZ…`
    );
  }

  try {
    await saveLocalMbzArchive(courseId, bytes, meta);
  } catch (e) {
    fail(
      `שמירה מקומית של קובץ ה-MBZ נכשלה: ${e instanceof Error ? e.message : String(e)}. ` +
        "ייתכן שאין מספיק מקום בדיסק של הדפדפן."
    );
  }

  return {
    storage_path: mbzIdbStoragePath(courseId),
    storage_backend: "idb",
    usedLocalFallback: true,
  };
}

/** @deprecated Prefer persistMbzArchive — kept for callers that only need Storage. */
export async function uploadMbzArchive(
  courseId: string,
  bytes: ArrayBuffer,
  contentType = "application/octet-stream"
): Promise<string> {
  const path = mbzStoragePath(courseId);
  const { error } = await supabase.storage
    .from(MBZ_STORAGE_BUCKET)
    .upload(path, bytes, { contentType, upsert: true });
  if (error) fail(`העלאת קובץ MBZ נכשלה: ${error.message}`);
  return path;
}

export async function downloadMbzArchive(source: CourseMbzSource): Promise<ArrayBuffer> {
  const backend: MbzStorageBackend =
    source.storage_backend === "idb" || source.storage_path.startsWith("idb:")
      ? "idb"
      : source.storage_backend === "reupload" || source.storage_path === "reupload"
        ? "reupload"
        : "supabase";

  if (backend === "reupload") {
    fail(
      "קובץ ה-MBZ לא נשמר בשרת — יש לבחור את הקובץ המקורי בעת הייצוא"
    );
  }

  if (backend === "idb") {
    const local = await loadLocalMbzArchive(source.course_id);
    if (!local) {
      fail(
        "קובץ ה-MBZ המקורי חסר באחסון המקומי של הדפדפן — לא ניתן לייצא. " +
          "ייבאו שוב את הקובץ באותו דפדפן, או השתמשו בדפדפן שבו בוצע הייבוא."
      );
    }
    return local;
  }

  const { data, error } = await supabase.storage
    .from(MBZ_STORAGE_BUCKET)
    .download(source.storage_path);
  if (error || !data) {
    fail(
      error?.message?.includes("not found") || error?.message?.includes("Object not found")
        ? "קובץ ה-MBZ המקורי חסר באחסון — לא ניתן לייצא"
        : `הורדת קובץ MBZ נכשלה: ${error?.message ?? "שגיאה לא ידועה"}`
    );
  }
  return data.arrayBuffer();
}

export async function deleteMbzArchiveForCourse(source: CourseMbzSource): Promise<void> {
  const backend: MbzStorageBackend =
    source.storage_backend === "idb" || source.storage_path.startsWith("idb:")
      ? "idb"
      : source.storage_backend === "reupload" || source.storage_path === "reupload"
        ? "reupload"
        : "supabase";

  if (backend === "reupload") return;

  if (backend === "idb") {
    try {
      await deleteLocalMbzArchive(source.course_id);
    } catch (e) {
      console.warn("MBZ IndexedDB cleanup failed:", e);
    }
    return;
  }

  const { error } = await supabase.storage.from(MBZ_STORAGE_BUCKET).remove([source.storage_path]);
  if (error) {
    console.warn("MBZ storage cleanup failed:", error.message);
  }
}

/** @deprecated Use deleteMbzArchiveForCourse */
export async function deleteMbzArchive(storagePath: string): Promise<void> {
  if (storagePath.startsWith("idb:")) {
    const courseId = storagePath.slice("idb:".length);
    try {
      await deleteLocalMbzArchive(courseId);
    } catch (e) {
      console.warn("MBZ IndexedDB cleanup failed:", e);
    }
    return;
  }
  const { error } = await supabase.storage.from(MBZ_STORAGE_BUCKET).remove([storagePath]);
  if (error) {
    console.warn("MBZ storage cleanup failed:", error.message);
  }
}

export async function getCourseMbzSource(courseId: string): Promise<CourseMbzSource | null> {
  const { data, error } = await supabase
    .from("course_mbz_sources")
    .select("*")
    .eq("course_id", courseId)
    .maybeSingle();
  if (error) fail(`טעינת מקור MBZ נכשלה: ${error.message}`);
  return (data as CourseMbzSource | null) ?? null;
}

export async function listCourseMbzBindings(courseId: string): Promise<CourseMbzBinding[]> {
  const { data, error } = await supabase
    .from("course_mbz_bindings")
    .select("*")
    .eq("course_id", courseId);
  if (error) fail(`טעינת קישורי MBZ נכשלה: ${error.message}`);
  return (data as CourseMbzBinding[]) ?? [];
}

export async function insertCourseMbzSource(row: {
  course_id: string;
  storage_path: string;
  source_filename: string;
  source_sha1: string;
  archive_kind: ArchiveKind;
  moodle_version: string | null;
  storage_backend: MbzStorageBackend;
}): Promise<void> {
  const { error } = await supabase.from("course_mbz_sources").insert(row);
  if (error) {
    const msg = error.message.toLowerCase();
    // Older DB: missing column or check constraint without 'reupload' — keep storage_path only.
    if (msg.includes("storage_backend") || msg.includes("check")) {
      const { storage_backend: _backend, ...rest } = row;
      const { error: err2 } = await supabase.from("course_mbz_sources").insert(rest);
      if (err2) fail(`שמירת מקור MBZ נכשלה: ${err2.message}`);
      return;
    }
    fail(`שמירת מקור MBZ נכשלה: ${error.message}`);
  }
}

export async function insertCourseMbzBindings(
  rows: Omit<CourseMbzBinding, "id" | "created_at">[]
): Promise<void> {
  if (rows.length === 0) return;
  const { error } = await supabase.from("course_mbz_bindings").insert(rows);
  if (error) fail(`שמירת קישורי MBZ נכשלה: ${error.message}`);
}
