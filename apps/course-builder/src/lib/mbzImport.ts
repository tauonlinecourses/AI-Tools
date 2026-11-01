/**
 * Import a Moodle .mbz as a new Course Builder course (preserve & patch source).
 */

import {
  buildManifest,
  decodeAllSections,
  extract,
  type BlobStore,
  type BlobUrlCache,
} from "@workspace/mbz-parser";
import { supabase } from "./supabase";
import { mapMbzToCourse } from "./mbzMap";
import { insertCourseMbzBindings, insertCourseMbzSource } from "./mbzStorage";

function fail(message: string): never {
  throw new Error(message);
}

export interface ImportMbzResult {
  courseId: string;
  warnings: string[];
}

/**
 * Parse .mbz → map → insert new course + bindings + upload original archive.
 */
export async function importCourseFromMbz(
  file: File,
  onProgress?: (message: string) => void
): Promise<ImportMbzResult> {
  onProgress?.("קורא את קובץ ה-MBZ…");
  const buffer = await file.arrayBuffer();
  const { vfs, sha1, archiveKind } = await extract(buffer);

  onProgress?.("מפענח מבנה הקורס…");
  const manifest = buildManifest(vfs, {
    name: file.name,
    sha1,
    sizeBytes: buffer.byteLength,
  });

  const blobStore: BlobStore = new Map();
  const urlCache: BlobUrlCache = new Map();
  const decoded = decodeAllSections(manifest, vfs, blobStore, urlCache);

  onProgress?.("ממפה לפיתוח קורסים…");
  const mapping = mapMbzToCourse(decoded, vfs);

  const sectionIdMap = new Map<string, string>();
  const pageIdMap = new Map<string, string>();

  for (const s of mapping.sections) {
    if (s.bindingOnly) continue;
    sectionIdMap.set(s.tempKey, crypto.randomUUID());
  }
  for (const p of mapping.pages) {
    pageIdMap.set(p.tempKey, crypto.randomUUID());
  }

  const homePageId = crypto.randomUUID();

  onProgress?.("יוצר קורס…");
  const { data: course, error: courseErr } = await supabase
    .from("courses")
    .insert({
      title: mapping.courseTitle,
      description: mapping.courseDescription,
    })
    .select("id")
    .single();
  if (courseErr || !course) {
    fail(`ייבוא MBZ נכשל ביצירת הקורס: ${courseErr?.message ?? "שגיאה לא ידועה"}`);
  }
  const courseId = course.id as string;

  try {
    const cbSections = mapping.sections.filter((s) => !s.bindingOnly);
    if (cbSections.length > 0) {
      const sectionRows = cbSections.map((s) => ({
        id: sectionIdMap.get(s.tempKey)!,
        course_id: courseId,
        title: s.title,
        position: s.position,
      }));
      const { error } = await supabase.from("sections").insert(sectionRows);
      if (error) fail(`ייבוא שיעורים נכשל: ${error.message}`);
    }

    const pageRows = [
      {
        id: homePageId,
        section_id: null as string | null,
        course_id: courseId,
        title: "עמוד ראשי",
        position: 0,
        notes: null as string | null,
        workflow_status: "in_progress",
      },
      ...mapping.pages.map((p) => ({
        id: pageIdMap.get(p.tempKey)!,
        section_id: sectionIdMap.get(p.sectionTempKey)!,
        course_id: null as string | null,
        title: p.title,
        position: p.position,
        notes: null as string | null,
        workflow_status: "in_progress",
      })),
    ];
    {
      const { error } = await supabase.from("pages").insert(pageRows);
      if (error) fail(`ייבוא עמודים נכשל: ${error.message}`);
    }

    const componentRows: {
      id: string;
      page_id: string;
      type: string;
      position: number;
      props: Record<string, unknown>;
    }[] = [];
    for (const p of mapping.pages) {
      const pageId = pageIdMap.get(p.tempKey)!;
      for (const c of p.components) {
        componentRows.push({
          id: crypto.randomUUID(),
          page_id: pageId,
          type: c.type,
          position: c.position,
          props: c.props as Record<string, unknown>,
        });
      }
    }
    if (componentRows.length > 0) {
      const { error } = await supabase.from("components").insert(componentRows);
      if (error) fail(`ייבוא רכיבים נכשל: ${error.message}`);
    }

    // Metadata only — never upload/store the multi‑hundred‑MB archive (Storage quota).
    // On הורד MBZ the user re-selects the original file; we verify SHA-1 then patch.
    onProgress?.("שומר מטא‑דאטה לייצוא…");
    await insertCourseMbzSource({
      course_id: courseId,
      storage_path: "reupload",
      source_filename: file.name,
      source_sha1: sha1,
      archive_kind: archiveKind,
      moodle_version: mapping.moodleVersion || null,
      storage_backend: "reupload",
    });
    mapping.warnings.push(
      "קובץ ה-MBZ עצמו לא נשמר בשרת. בעת הורדת MBZ תתבקשו לבחור שוב את הקובץ המקורי."
    );

    const bindings: Parameters<typeof insertCourseMbzBindings>[0] = [];

    for (const s of mapping.sections) {
      const cbId = s.bindingOnly
        ? sectionIdMap.get(s.parentCbSectionTempKey!)!
        : sectionIdMap.get(s.tempKey)!;
      bindings.push({
        course_id: courseId,
        entity_kind: "section",
        cb_id: cbId,
        moodle_id: s.moodleId,
        modtype: null,
        activity_dir: null,
        payload_field: null,
        editable: !s.bindingOnly,
        meta: {
          ...s.meta,
          bindingOnly: !!s.bindingOnly,
        },
      });
    }

    for (const p of mapping.pages) {
      bindings.push({
        course_id: courseId,
        entity_kind: "activity",
        cb_id: pageIdMap.get(p.tempKey)!,
        moodle_id: p.binding.moodleId,
        modtype: p.binding.modtype,
        activity_dir: p.binding.activityDir,
        payload_field: p.binding.payloadField,
        editable: true,
        meta: p.binding.meta as unknown as Record<string, unknown>,
      });
    }

    await insertCourseMbzBindings(bindings);
    onProgress?.("הושלם");
    return { courseId, warnings: mapping.warnings };
  } catch (err) {
    await supabase.from("courses").delete().eq("id", courseId);
    throw err instanceof Error ? err : new Error(String(err));
  }
}

/** True when file looks like an MBZ/zip backup (by extension or magic). */
export function isMbzUploadFile(file: File): boolean {
  const name = file.name.toLowerCase();
  if (name.endsWith(".mbz") || name.endsWith(".zip") || name.endsWith(".tgz") || name.endsWith(".tar.gz")) {
    return true;
  }
  return false;
}
