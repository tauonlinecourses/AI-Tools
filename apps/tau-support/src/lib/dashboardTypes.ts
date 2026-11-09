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
  /** null = no similar question found (not part of any group). */
  clusterId: number | null;
  x: number;
  y: number;
  z: number;
}

export interface DashboardCluster {
  id: number;
  name: string;
  category: string;
  size: number;
  unansweredCount: number;
  courseIds: string[];
  firstAt: string | null;
  lastAt: string | null;
  /** Threads closest to the group's center, most typical first. */
  sampleThreadIds: string[];
  /** Fixed group (e.g. "אין בעיות"): AI naming and merging leave it alone. */
  reserved?: boolean;
  /** Questions with no similar partner, collected per category; not repeats. */
  lone?: boolean;
}

export interface DashboardSnapshot {
  computedAt: string;
  similarityThreshold: number;
  /** Questions in the database, before MAX_DASHBOARD_QUESTIONS is applied. */
  totalAvailable: number;
  /** False until the AI naming step has finished. */
  named: boolean;
  clusters: DashboardCluster[];
  points: DashboardPoint[];
}

export interface DashboardStepResult {
  ok: boolean;
  message?: string;
  embedded?: number;
  remaining?: number;
  clusters?: number;
}
