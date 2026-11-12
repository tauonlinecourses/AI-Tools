/** Shared shapes for the question dashboard (BFF ↔ browser). */

export type QuestionStatus = "answered" | "unanswered" | "no_answer_needed";

export interface DashboardPoint {
  threadId: string;
  courseId: string;
  title: string;
  /** Start of the comment body, for the 3D map's hover. */
  snippet?: string;
  createdAt: string | null;
  status: QuestionStatus;
  /** One of the fixed names in categoryColors.ts. */
  category: string;
  x: number;
  y: number;
  z: number;
}

/** Bump when the snapshot shape changes; older snapshots ask for a refresh. */
export const DASHBOARD_FORMAT_VERSION = 2;

export interface DashboardSnapshot {
  /** Missing on snapshots saved before per-question categories (v1). */
  formatVersion?: number;
  computedAt: string;
  /** Questions in the database, before MAX_DASHBOARD_QUESTIONS is applied. */
  totalAvailable: number;
  points: DashboardPoint[];
}

export interface DashboardStepResult {
  ok: boolean;
  message?: string;
  embedded?: number;
  /** Questions given a saved category in this call. */
  categorized?: number;
  remaining?: number;
  /** Questions saved in the snapshot. */
  questions?: number;
}
