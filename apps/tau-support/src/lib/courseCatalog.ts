/**
 * Course catalog CRUD via the Tau Supabase project (BFF on the browser).
 * Bundled `courses.json` stays the seed; UI-added courses live in `courses`.
 */

import {
  type CourseEntry,
  mergeCourseCatalog,
  BUNDLED_COURSES,
} from "./courses.js";
import { isSupabaseConfigured, supabase } from "./supabase.js";

export interface CourseCatalogListResult {
  ok: boolean;
  skipped?: boolean;
  message?: string;
  /** Bundled seed merged with rows from Supabase. */
  courses?: CourseEntry[];
}

export interface CourseCatalogWriteResult {
  ok: boolean;
  skipped?: boolean;
  message?: string;
  course?: CourseEntry;
}

type CourseDbRow = {
  id: string;
  name: string;
  name_he: string | null;
  forum_category: string | null;
  forum_topic_id?: string | null;
};

const COURSE_SELECT = "id, name, name_he, forum_category, forum_topic_id";

function rowToCourse(row: CourseDbRow): CourseEntry {
  return {
    id: row.id,
    name: row.name,
    nameHe: row.name_he?.trim() || undefined,
    forumCategory: row.forum_category?.trim() || "בעיות טכניות",
    forumTopicId: row.forum_topic_id?.trim() || undefined,
  };
}

function normalizeCourseInput(input: {
  id: string;
  name: string;
  nameHe?: string;
  forumCategory: string;
  forumTopicId?: string;
}): CourseEntry | { error: string } {
  const id = input.id.trim();
  const name = input.name.trim();
  const nameHe = input.nameHe?.trim() || undefined;
  const forumCategory = input.forumCategory.trim();
  const forumTopicId = input.forumTopicId?.trim() || undefined;

  if (!id) return { error: "מזהה הקורס חסר" };
  if (!/^course-v1:[^\s]+$/i.test(id)) {
    return {
      error:
        "מזהה הקורס צריך להיראות כמו course-v1:ORG+course_key+run (מ־Studio / ה־URL)",
    };
  }
  if (!name) return { error: "שם הקורס חסר" };
  if (!forumCategory) return { error: "שם קטגוריית הפורום חסר" };

  return { id, name, nameHe, forumCategory, forumTopicId };
}

async function listRemoteCourses(): Promise<CourseEntry[]> {
  const primary = await supabase
    .from("courses")
    .select(COURSE_SELECT)
    .order("created_at", { ascending: true });
  if (!primary.error) {
    return ((primary.data ?? []) as CourseDbRow[]).map(rowToCourse);
  }
  // Pre-migration 012: forum_topic_id column missing.
  if (/forum_topic_id|42703|PGRST204/i.test(primary.error.message)) {
    const fallback = await supabase
      .from("courses")
      .select("id, name, name_he, forum_category")
      .order("created_at", { ascending: true });
    if (fallback.error) throw fallback.error;
    return ((fallback.data ?? []) as CourseDbRow[]).map(rowToCourse);
  }
  throw primary.error;
}

/** Browser: BFF. Server: service client. Always returns at least the bundled seed. */
export async function listCourseCatalog(): Promise<CourseCatalogListResult> {
  if (typeof window !== "undefined") {
    try {
      const { tauData } = await import("./tauDataClient.js");
      return await tauData<CourseCatalogListResult>("listCourseCatalog");
    } catch (err) {
      return {
        ok: false,
        message: err instanceof Error ? err.message : "טעינת הקורסים נכשלה",
        courses: BUNDLED_COURSES,
      };
    }
  }

  if (!isSupabaseConfigured) {
    return { ok: true, skipped: true, courses: BUNDLED_COURSES };
  }

  try {
    const remote = await listRemoteCourses();
    return {
      ok: true,
      courses: mergeCourseCatalog(BUNDLED_COURSES, remote),
    };
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : "טעינת הקורסים נכשלה",
      courses: BUNDLED_COURSES,
    };
  }
}

/** Create (or refresh metadata for) a course row. Fails if the id already exists in the merged catalog when `requireNew`. */
export async function createCourse(
  input: {
    id: string;
    name: string;
    nameHe?: string;
    forumCategory: string;
    forumTopicId?: string;
  },
  options?: { requireNew?: boolean }
): Promise<CourseCatalogWriteResult> {
  const requireNew = options?.requireNew !== false;

  if (typeof window !== "undefined") {
    try {
      const { tauData } = await import("./tauDataClient.js");
      return await tauData<CourseCatalogWriteResult>("createCourse", {
        ...input,
        requireNew,
      });
    } catch (err) {
      return {
        ok: false,
        message: err instanceof Error ? err.message : "הוספת הקורס נכשלה",
      };
    }
  }

  if (!isSupabaseConfigured) {
    return {
      ok: false,
      skipped: true,
      message: "Supabase לא מוגדר — לא ניתן להוסיף קורסים מהממשק.",
    };
  }

  const normalized = normalizeCourseInput(input);
  if ("error" in normalized) {
    return { ok: false, message: normalized.error };
  }

  try {
    if (requireNew) {
      const remote = await listRemoteCourses();
      const merged = mergeCourseCatalog(BUNDLED_COURSES, remote);
      if (merged.some((c) => c.id === normalized.id)) {
        return { ok: false, message: "הקורס כבר קיים ברשימה" };
      }
    }

    const now = new Date().toISOString();
    const row: Record<string, unknown> = {
      id: normalized.id,
      name: normalized.name,
      name_he: normalized.nameHe ?? null,
      forum_category: normalized.forumCategory,
      updated_at: now,
    };
    // Only send forum_topic_id when set — keeps create working before migration 012
    // if the topic id field is left empty.
    if (normalized.forumTopicId) {
      row.forum_topic_id = normalized.forumTopicId;
    }

    const upserted = normalized.forumTopicId
      ? await supabase
          .from("courses")
          .upsert(row, { onConflict: "id" })
          .select(COURSE_SELECT)
          .single()
      : await supabase
          .from("courses")
          .upsert(row, { onConflict: "id" })
          .select("id, name, name_he, forum_category")
          .single();

    if (upserted.error) throw upserted.error;
    return {
      ok: true,
      course: rowToCourse(upserted.data as unknown as CourseDbRow),
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "הוספת הקורס נכשלה";
    if (/forum_topic_id|42703|PGRST204/i.test(message)) {
      return {
        ok: false,
        message:
          "עמודת forum_topic_id חסרה. הריצו את migration 012_courses_forum_topic_id.sql ב-Supabase, או השאירו את מזהה הנושא ריק.",
      };
    }
    return { ok: false, message };
  }
}
