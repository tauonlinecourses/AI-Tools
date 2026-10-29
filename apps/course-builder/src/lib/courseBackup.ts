/**
 * Course-level local backup: versioned JSON download + import as a new course.
 * Media stays as URL strings; binaries are not bundled.
 */

import { supabase } from "./supabase";
import {
  getCourseTree,
  listCommentsForPage,
  listComponents,
  listPageComments,
} from "./api";
import type {
  BlockProps,
  CommentAuthorRole,
  ComponentType,
  PageWorkflowStatus,
} from "./types";
import { isHomePage } from "./types";

export const BACKUP_FORMAT = "course-builder-backup" as const;
export const BACKUP_VERSION = 1 as const;

const COMPONENT_TYPES = new Set<ComponentType>([
  "banner",
  "video",
  "interactive_video",
  "text",
  "question",
  "image",
  "button",
  "notes_board",
  "word_cloud",
  "forum",
]);

const AUTHOR_ROLES = new Set<CommentAuthorRole>(["edit", "implement", "review"]);
const WORKFLOW_STATUSES = new Set<PageWorkflowStatus>([
  "in_progress",
  "ready_for_implementation",
]);

export interface BackupSection {
  tempKey: string;
  title: string;
  position: number;
  opens_at: string | null;
  assignments_due_at: string | null;
  files_folder_url: string | null;
  videos_folder_url: string | null;
}

export interface BackupPage {
  tempKey: string;
  /** null for course home page */
  sectionTempKey: string | null;
  title: string;
  position: number;
  notes: string | null;
  workflow_status: PageWorkflowStatus;
  isHome: boolean;
}

export interface BackupComponent {
  tempKey: string;
  pageTempKey: string;
  type: ComponentType;
  position: number;
  props: BlockProps;
  implemented_at: string | null;
  /** Preserved so import can restore implemented / needs_update status. */
  updated_at: string;
}

export interface BackupComment {
  componentTempKey: string;
  author_role: CommentAuthorRole;
  body: string;
  resolved_at: string | null;
  created_at: string;
}

export interface BackupPageComment {
  pageTempKey: string;
  author_role: CommentAuthorRole;
  body: string;
  resolved_at: string | null;
  created_at: string;
}

export interface CourseBackup {
  format: typeof BACKUP_FORMAT;
  version: typeof BACKUP_VERSION;
  exportedAt: string;
  course: {
    title: string;
    description: string | null;
  };
  sections: BackupSection[];
  pages: BackupPage[];
  components: BackupComponent[];
  comments: BackupComment[];
  /** Page-header comment threads (optional on older backups). */
  pageComments: BackupPageComment[];
}

function fail(message: string): never {
  throw new Error(message);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asString(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) {
    fail(`קובץ גיבוי לא תקין: שדה חסר או לא תקין (${field})`);
  }
  return value;
}

function asNullableString(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") {
    fail("קובץ גיבוי לא תקין: ערך טקסט לא תקין");
  }
  return value;
}

function asNumber(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    fail(`קובץ גיבוי לא תקין: שדה מספרי לא תקין (${field})`);
  }
  return value;
}

function asBoolean(value: unknown, field: string): boolean {
  if (typeof value !== "boolean") {
    fail(`קובץ גיבוי לא תקין: שדה בוליאני לא תקין (${field})`);
  }
  return value;
}

/** Assemble a portable backup from the live course tree + blocks + comments. */
export async function buildCourseBackup(courseId: string): Promise<CourseBackup> {
  const tree = await getCourseTree(courseId);
  const sections: BackupSection[] = tree.sections.map((s) => ({
    tempKey: s.id,
    title: s.title,
    position: s.position,
    opens_at: s.opens_at,
    assignments_due_at: s.assignments_due_at,
    files_folder_url: s.files_folder_url,
    videos_folder_url: s.videos_folder_url,
  }));

  const pages: BackupPage[] = tree.pages.map((p) => ({
    tempKey: p.id,
    sectionTempKey: p.section_id,
    title: p.title,
    position: p.position,
    notes: p.notes,
    workflow_status: p.workflow_status,
    isHome: isHomePage(p),
  }));

  const components: BackupComponent[] = [];
  const comments: BackupComment[] = [];
  const pageComments: BackupPageComment[] = [];

  for (const page of tree.pages) {
    const pageComponents = await listComponents(page.id);
    for (const c of pageComponents) {
      components.push({
        tempKey: c.id,
        pageTempKey: page.id,
        type: c.type,
        position: c.position,
        props: c.props ?? {},
        implemented_at: c.implemented_at,
        updated_at: c.updated_at,
      });
    }
    const blockComments = await listCommentsForPage(page.id);
    for (const comment of blockComments) {
      comments.push({
        componentTempKey: comment.component_id,
        author_role: comment.author_role,
        body: comment.body,
        resolved_at: comment.resolved_at,
        created_at: comment.created_at,
      });
    }
    const headerComments = await listPageComments(page.id);
    for (const comment of headerComments) {
      pageComments.push({
        pageTempKey: comment.page_id,
        author_role: comment.author_role,
        body: comment.body,
        resolved_at: comment.resolved_at,
        created_at: comment.created_at,
      });
    }
  }

  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    course: {
      title: tree.course.title,
      description: tree.course.description,
    },
    sections,
    pages,
    components,
    comments,
    pageComments,
  };
}

/** Validate and normalize a parsed JSON value into CourseBackup. */
export function parseCourseBackup(raw: unknown): CourseBackup {
  if (!isRecord(raw)) {
    fail("קובץ גיבוי לא תקין: התוכן אינו אובייקט JSON");
  }
  if (raw.format !== BACKUP_FORMAT) {
    fail('קובץ גיבוי לא תקין: סוג הקובץ אינו "course-builder-backup"');
  }
  if (raw.version !== BACKUP_VERSION) {
    fail(`קובץ גיבוי לא נתמך: גרסה ${String(raw.version)} (נתמכת: ${BACKUP_VERSION})`);
  }
  if (!isRecord(raw.course)) {
    fail("קובץ גיבוי לא תקין: חסר מידע על הקורס");
  }
  const title = asString(raw.course.title, "course.title");
  const description = asNullableString(raw.course.description);

  if (!Array.isArray(raw.sections) || !Array.isArray(raw.pages)) {
    fail("קובץ גיבוי לא תקין: חסרות רשימות שיעורים או עמודים");
  }
  if (!Array.isArray(raw.components) || !Array.isArray(raw.comments)) {
    fail("קובץ גיבוי לא תקין: חסרות רשימות רכיבים או הערות");
  }

  const sectionKeys = new Set<string>();
  const sections: BackupSection[] = raw.sections.map((item, index) => {
    if (!isRecord(item)) fail(`קובץ גיבוי לא תקין: שיעור ${index + 1}`);
    const tempKey = asString(item.tempKey, `sections[${index}].tempKey`);
    if (sectionKeys.has(tempKey)) {
      fail(`קובץ גיבוי לא תקין: מפתח שיעור כפול (${tempKey})`);
    }
    sectionKeys.add(tempKey);
    return {
      tempKey,
      title: asString(item.title, `sections[${index}].title`),
      position: asNumber(item.position, `sections[${index}].position`),
      opens_at: asNullableString(item.opens_at),
      assignments_due_at: asNullableString(item.assignments_due_at),
      files_folder_url: asNullableString(item.files_folder_url),
      videos_folder_url: asNullableString(item.videos_folder_url),
    };
  });

  const pageKeys = new Set<string>();
  let homeCount = 0;
  const pages: BackupPage[] = raw.pages.map((item, index) => {
    if (!isRecord(item)) fail(`קובץ גיבוי לא תקין: עמוד ${index + 1}`);
    const tempKey = asString(item.tempKey, `pages[${index}].tempKey`);
    if (pageKeys.has(tempKey)) {
      fail(`קובץ גיבוי לא תקין: מפתח עמוד כפול (${tempKey})`);
    }
    pageKeys.add(tempKey);
    const isHome = asBoolean(item.isHome, `pages[${index}].isHome`);
    if (isHome) homeCount += 1;
    const sectionTempKey = asNullableString(item.sectionTempKey);
    if (isHome && sectionTempKey !== null) {
      fail("קובץ גיבוי לא תקין: עמוד ראשי לא יכול להיות משויך לשיעור");
    }
    if (!isHome && (sectionTempKey === null || !sectionKeys.has(sectionTempKey))) {
      fail(`קובץ גיבוי לא תקין: עמוד ${index + 1} משויך לשיעור לא קיים`);
    }
    const workflow = asString(
      item.workflow_status,
      `pages[${index}].workflow_status`
    ) as PageWorkflowStatus;
    if (!WORKFLOW_STATUSES.has(workflow)) {
      fail(`קובץ גיבוי לא תקין: סטטוס עמוד לא מוכר (${workflow})`);
    }
    return {
      tempKey,
      sectionTempKey,
      title: asString(item.title, `pages[${index}].title`),
      position: asNumber(item.position, `pages[${index}].position`),
      notes: asNullableString(item.notes),
      workflow_status: workflow,
      isHome,
    };
  });

  if (homeCount === 0) {
    fail("קובץ גיבוי לא תקין: חסר עמוד ראשי");
  }
  if (homeCount > 1) {
    fail("קובץ גיבוי לא תקין: יותר מעמוד ראשי אחד");
  }

  const componentKeys = new Set<string>();
  const components: BackupComponent[] = raw.components.map((item, index) => {
    if (!isRecord(item)) fail(`קובץ גיבוי לא תקין: רכיב ${index + 1}`);
    const tempKey = asString(item.tempKey, `components[${index}].tempKey`);
    if (componentKeys.has(tempKey)) {
      fail(`קובץ גיבוי לא תקין: מפתח רכיב כפול (${tempKey})`);
    }
    componentKeys.add(tempKey);
    const pageTempKey = asString(item.pageTempKey, `components[${index}].pageTempKey`);
    if (!pageKeys.has(pageTempKey)) {
      fail(`קובץ גיבוי לא תקין: רכיב ${index + 1} משויך לעמוד לא קיים`);
    }
    const type = asString(item.type, `components[${index}].type`) as ComponentType;
    if (!COMPONENT_TYPES.has(type)) {
      fail(`קובץ גיבוי לא תקין: סוג רכיב לא מוכר (${type})`);
    }
    const props = isRecord(item.props) ? (item.props as BlockProps) : {};
    return {
      tempKey,
      pageTempKey,
      type,
      position: asNumber(item.position, `components[${index}].position`),
      props,
      implemented_at: asNullableString(item.implemented_at),
      updated_at:
        typeof item.updated_at === "string" && item.updated_at
          ? item.updated_at
          : new Date().toISOString(),
    };
  });

  const comments: BackupComment[] = raw.comments.map((item, index) => {
    if (!isRecord(item)) fail(`קובץ גיבוי לא תקין: הערה ${index + 1}`);
    const componentTempKey = asString(
      item.componentTempKey,
      `comments[${index}].componentTempKey`
    );
    if (!componentKeys.has(componentTempKey)) {
      fail(`קובץ גיבוי לא תקין: הערה ${index + 1} משויכת לרכיב לא קיים`);
    }
    const author_role = asString(
      item.author_role,
      `comments[${index}].author_role`
    ) as CommentAuthorRole;
    if (!AUTHOR_ROLES.has(author_role)) {
      fail(`קובץ גיבוי לא תקין: תפקיד מחבר הערה לא מוכר (${author_role})`);
    }
    return {
      componentTempKey,
      author_role,
      body: asString(item.body, `comments[${index}].body`),
      resolved_at: asNullableString(item.resolved_at),
      created_at:
        typeof item.created_at === "string" && item.created_at
          ? item.created_at
          : new Date().toISOString(),
    };
  });

  const rawPageComments = Array.isArray(raw.pageComments) ? raw.pageComments : [];
  const pageComments: BackupPageComment[] = rawPageComments.map((item, index) => {
    if (!isRecord(item)) fail(`קובץ גיבוי לא תקין: הערת עמוד ${index + 1}`);
    const pageTempKey = asString(
      item.pageTempKey,
      `pageComments[${index}].pageTempKey`
    );
    if (!pageKeys.has(pageTempKey)) {
      fail(`קובץ גיבוי לא תקין: הערת עמוד ${index + 1} משויכת לעמוד לא קיים`);
    }
    const author_role = asString(
      item.author_role,
      `pageComments[${index}].author_role`
    ) as CommentAuthorRole;
    if (!AUTHOR_ROLES.has(author_role)) {
      fail(`קובץ גיבוי לא תקין: תפקיד מחבר הערת עמוד לא מוכר (${author_role})`);
    }
    return {
      pageTempKey,
      author_role,
      body: asString(item.body, `pageComments[${index}].body`),
      resolved_at: asNullableString(item.resolved_at),
      created_at:
        typeof item.created_at === "string" && item.created_at
          ? item.created_at
          : new Date().toISOString(),
    };
  });

  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt:
      typeof raw.exportedAt === "string" && raw.exportedAt
        ? raw.exportedAt
        : new Date().toISOString(),
    course: { title, description },
    sections,
    pages,
    components,
    comments,
    pageComments,
  };
}

/** Read a File and parse it as CourseBackup. */
export async function parseCourseBackupFile(file: File): Promise<CourseBackup> {
  let text: string;
  try {
    text = await file.text();
  } catch {
    fail("לא ניתן לקרוא את קובץ הגיבוי");
  }
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    fail("קובץ גיבוי לא תקין: JSON פגום");
  }
  return parseCourseBackup(raw);
}

/**
 * Import backup as a brand-new course. Mints new UUIDs for all rows.
 * On failure after the course row exists, deletes the course (cascade).
 */
export async function importCourseBackup(backup: CourseBackup): Promise<string> {
  const sectionIdMap = new Map<string, string>();
  const pageIdMap = new Map<string, string>();
  const componentIdMap = new Map<string, string>();

  for (const s of backup.sections) {
    sectionIdMap.set(s.tempKey, crypto.randomUUID());
  }
  for (const p of backup.pages) {
    pageIdMap.set(p.tempKey, crypto.randomUUID());
  }
  for (const c of backup.components) {
    componentIdMap.set(c.tempKey, crypto.randomUUID());
  }

  const { data: course, error: courseErr } = await supabase
    .from("courses")
    .insert({
      title: backup.course.title,
      description: backup.course.description,
    })
    .select("id")
    .single();
  if (courseErr || !course) {
    fail(`ייבוא גיבוי נכשל ביצירת הקורס: ${courseErr?.message ?? "שגיאה לא ידועה"}`);
  }
  const courseId = course.id as string;

  try {
    if (backup.sections.length > 0) {
      const sectionRows = backup.sections.map((s) => ({
        id: sectionIdMap.get(s.tempKey)!,
        course_id: courseId,
        title: s.title,
        position: s.position,
        opens_at: s.opens_at,
        assignments_due_at: s.assignments_due_at,
        files_folder_url: s.files_folder_url,
        videos_folder_url: s.videos_folder_url,
      }));
      const { error } = await supabase.from("sections").insert(sectionRows);
      if (error) fail(`ייבוא שיעורים נכשל: ${error.message}`);
    }

    if (backup.pages.length > 0) {
      const pageRows = backup.pages.map((p) => ({
        id: pageIdMap.get(p.tempKey)!,
        section_id: p.isHome ? null : sectionIdMap.get(p.sectionTempKey!)!,
        course_id: p.isHome ? courseId : null,
        title: p.title,
        position: p.position,
        notes: p.notes,
        workflow_status: p.workflow_status,
      }));
      const { error } = await supabase.from("pages").insert(pageRows);
      if (error) fail(`ייבוא עמודים נכשל: ${error.message}`);
    }

    if (backup.components.length > 0) {
      // INSERT does not fire the updated_at trigger, so both timestamps stick.
      const componentRows = backup.components.map((c) => ({
        id: componentIdMap.get(c.tempKey)!,
        page_id: pageIdMap.get(c.pageTempKey)!,
        type: c.type,
        position: c.position,
        props: c.props ?? {},
        implemented_at: c.implemented_at,
        updated_at: c.updated_at || new Date().toISOString(),
      }));
      const { error } = await supabase.from("components").insert(componentRows);
      if (error) fail(`ייבוא רכיבים נכשל: ${error.message}`);
    }

    if (backup.comments.length > 0) {
      const commentRows = backup.comments.map((c) => ({
        component_id: componentIdMap.get(c.componentTempKey)!,
        author_role: c.author_role,
        body: c.body,
        resolved_at: c.resolved_at,
        created_at: c.created_at,
      }));
      const { error } = await supabase.from("component_comments").insert(commentRows);
      if (error) fail(`ייבוא הערות נכשל: ${error.message}`);
    }

    if (backup.pageComments.length > 0) {
      const pageCommentRows = backup.pageComments.map((c) => ({
        page_id: pageIdMap.get(c.pageTempKey)!,
        author_role: c.author_role,
        body: c.body,
        resolved_at: c.resolved_at,
        created_at: c.created_at,
      }));
      const { error } = await supabase.from("page_comments").insert(pageCommentRows);
      if (error) fail(`ייבוא הערות עמוד נכשל: ${error.message}`);
    }

    return courseId;
  } catch (err) {
    await supabase.from("courses").delete().eq("id", courseId);
    throw err instanceof Error ? err : new Error(String(err));
  }
}

function sanitizeFilename(title: string): string {
  const cleaned = title
    .trim()
    // eslint-disable-next-line no-control-regex
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "")
    .replace(/\s+/g, "-")
    .slice(0, 80);
  return cleaned || "course";
}

function formatDateForFilename(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Trigger a browser download of the backup JSON. */
export function downloadBackupFile(backup: CourseBackup, title: string): void {
  const json = JSON.stringify(backup, null, 2);
  const blob = new Blob([json], { type: "application/json;charset=utf-8" });
  const filename = `${sanitizeFilename(title)}-${formatDateForFilename(new Date())}.coursebuilder.json`;
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** Build backup and download in one step. */
export async function exportCourseBackup(courseId: string): Promise<void> {
  const backup = await buildCourseBackup(courseId);
  downloadBackupFile(backup, backup.course.title);
}
