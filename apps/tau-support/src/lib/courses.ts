/**
 * Course catalog helpers.
 * Edit the list in `courses.json` — do not hardcode courses here.
 * The hub sidebar reads COURSES from this module.
 */

import coursesJson from "./courses.json";

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
   */
  forumCategory: string;
}

export const COURSES: CourseEntry[] = coursesJson;

export const CUSTOM_COURSE_VALUE = "__custom__";

export function findCourseById(courseId: string): CourseEntry | undefined {
  const trimmed = courseId.trim();
  return COURSES.find((course) => course.id === trimmed);
}

export function courseLabel(course: CourseEntry): string {
  return course.nameHe ? `${course.nameHe} — ${course.name}` : course.name;
}
