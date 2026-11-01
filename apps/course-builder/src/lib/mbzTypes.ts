import type { ArchiveKind } from "@workspace/mbz-parser";

export const MBZ_EDITABLE_MODTYPES = [
  "page",
  "label",
  "resource",
  "url",
  "hvp",
  "board",
] as const;
export type MbzEditableModtype = (typeof MBZ_EDITABLE_MODTYPES)[number];

export function isMbzEditableModtype(type: string): type is MbzEditableModtype {
  return (MBZ_EDITABLE_MODTYPES as readonly string[]).includes(type);
}

/**
 * Where the original .mbz bytes live for preserve-and-patch export.
 * - `reupload` (default): nothing stored; user picks the original file on export
 * - `idb` / `supabase`: legacy paths from earlier builds
 */
export type MbzStorageBackend = "reupload" | "supabase" | "idb";

export interface CourseMbzSource {
  course_id: string;
  storage_path: string;
  source_filename: string;
  source_sha1: string;
  archive_kind: ArchiveKind;
  moodle_version: string | null;
  imported_at: string;
  /** Defaults to reupload — original archive is not persisted. */
  storage_backend?: MbzStorageBackend | null;
}

export type MbzBindingEntityKind = "section" | "activity";

export interface CourseMbzBinding {
  id: string;
  course_id: string;
  entity_kind: MbzBindingEntityKind;
  cb_id: string;
  moodle_id: string;
  modtype: string | null;
  activity_dir: string | null;
  payload_field: string | null;
  editable: boolean;
  meta: Record<string, unknown>;
  created_at: string;
}

/** Stored on section bindings for sequence rebuild. */
export interface SectionBindingMeta {
  originalSequence: string[];
  /** Non-editable cmids (including subsection) preserved on export. */
  preservedCmids: string[];
  /** Moodle section number from backup. */
  sectionNumber?: number;
}

export interface ActivityBindingMeta {
  originalName: string;
  parentSectionMoodleId: string;
  /** For url: separate intro HTML if any. */
  introHtml?: string | null;
  /** For resource: primary attached filename if known. */
  resourceFilename?: string | null;
}
