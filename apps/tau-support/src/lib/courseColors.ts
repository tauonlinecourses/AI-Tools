import { getRuntimeCourseCatalog } from "./courses";

/**
 * Stable palette for monthly "by course" stacks. Index follows the runtime
 * catalog order (bundled `courses.json`, then UI-added courses) so a course
 * keeps the same color across months and filters.
 */
const COURSE_PALETTE = [
  "#0284c7",
  "#c2410c",
  "#15803d",
  "#7c3aed",
  "#be185d",
  "#0f766e",
  "#b45309",
  "#1d4ed8",
  "#a16207",
  "#334155",
  "#0891b2",
  "#dc2626",
  "#4d7c0f",
  "#9333ea",
  "#db2777",
  "#0e7490",
];

function fallbackIndex(courseId: string): number {
  let hash = 0;
  for (let i = 0; i < courseId.length; i += 1) {
    hash = (hash + courseId.charCodeAt(i) * (i + 1)) % COURSE_PALETTE.length;
  }
  return hash;
}

export function courseColor(courseId: string): string {
  const catalogIndex = getRuntimeCourseCatalog().findIndex(
    (c) => c.id === courseId
  );
  const index =
    catalogIndex >= 0 ? catalogIndex % COURSE_PALETTE.length : fallbackIndex(courseId);
  return COURSE_PALETTE[index]!;
}
