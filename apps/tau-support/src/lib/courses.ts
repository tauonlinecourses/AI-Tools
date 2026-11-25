/**
 * Course catalog helpers.
 * Built-in seed list: `courses.json`.
 * Runtime catalog (seed + courses added in the UI / Supabase) is set via
 * `setRuntimeCourseCatalog` after hydrate — `findCourseById` reads that.
 */

// Node ESM (Vercel BFF) requires the import attribute; Vite accepts it too.
import coursesJson from "./courses.json" with { type: "json" };

export interface CourseEntry {
  /** Open edX course key, e.g. course-v1:TAU+ACD_TAU_cs101x+2019_3 */
  id: string;
  /** English (or staff-facing) display name */
  name: string;
  /** Optional Hebrew title shown in the UI */
  nameHe?: string;
  /**
   * Technical-help forum category name as it appears in the campus IL
   * discussions URL after `/category/`. Can differ per course.
   * If missing in the course, the server also tries
   * "פורום בעיות טכניות" and "בעיות טכניות".
   */
  forumCategory: string;
  /**
   * Optional stable Campus IL `topic_id` for `forumCategory`. When set, the
   * poll skips `/course_topics/` (which intermittently returns 500 on Campus
   * IL) and filters threads by this id directly.
   */
  forumTopicId?: string;
}

/** Seed catalog shipped with the app (edit `courses.json` to change defaults). */
export const BUNDLED_COURSES: CourseEntry[] = coursesJson;

/**
 * @deprecated Prefer `getRuntimeCourseCatalog()` after App hydrate.
 * Kept as an alias of the bundled seed so older imports keep working until
 * the runtime catalog is set.
 */
export const COURSES: CourseEntry[] = BUNDLED_COURSES;

export const CUSTOM_COURSE_VALUE = "__custom__";

let runtimeCatalog: CourseEntry[] = BUNDLED_COURSES;

export function setRuntimeCourseCatalog(courses: CourseEntry[]): void {
  runtimeCatalog = courses.length > 0 ? courses : BUNDLED_COURSES;
}

export function getRuntimeCourseCatalog(): CourseEntry[] {
  return runtimeCatalog;
}

/**
 * Bundled order first, then remote-only courses (UI-added) in remote order.
 * Remote fields overlay bundled ones when the same id exists in both.
 */
export function mergeCourseCatalog(
  bundled: CourseEntry[],
  remote: CourseEntry[]
): CourseEntry[] {
  const byId = new Map<string, CourseEntry>();
  for (const course of bundled) {
    byId.set(course.id, { ...course });
  }
  for (const remoteCourse of remote) {
    const existing = byId.get(remoteCourse.id);
    if (existing) {
      byId.set(remoteCourse.id, {
        ...existing,
        name: remoteCourse.name.trim() || existing.name,
        nameHe: remoteCourse.nameHe?.trim() || existing.nameHe,
        forumCategory:
          remoteCourse.forumCategory.trim() || existing.forumCategory,
        forumTopicId:
          remoteCourse.forumTopicId?.trim() || existing.forumTopicId,
      });
    } else {
      byId.set(remoteCourse.id, { ...remoteCourse });
    }
  }

  const out: CourseEntry[] = [];
  const seen = new Set<string>();
  for (const course of bundled) {
    const merged = byId.get(course.id);
    if (merged) {
      out.push(merged);
      seen.add(course.id);
    }
  }
  for (const remoteCourse of remote) {
    if (seen.has(remoteCourse.id)) continue;
    const merged = byId.get(remoteCourse.id);
    if (merged) {
      out.push(merged);
      seen.add(remoteCourse.id);
    }
  }
  return out;
}

export function findCourseById(courseId: string): CourseEntry | undefined {
  const trimmed = courseId.trim();
  return runtimeCatalog.find((course) => course.id === trimmed);
}

export function courseLabel(course: CourseEntry): string {
  return course.nameHe ? `${course.nameHe} — ${course.name}` : course.name;
}
