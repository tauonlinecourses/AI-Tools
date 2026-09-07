/**
 * Check-all run helpers: course list, cursor, tab lock, and error classification.
 */

import type { CourseEntry } from "./courses";

export const CHECK_ALL_GAP_MS = 3000;
export const CHECK_ALL_CURSOR_KEY = "tau-support-check-all-cursor";
export const CHECK_ALL_LOCK_KEY = "tau-support-check-all-lock";
export const CHECK_ALL_LOCK_STALE_MS = 4 * 60 * 1000;
export const LAST_CHECK_ALL_KEY = "tau-support-last-check-all";

export type CheckAllPhase = "fetching" | "waiting" | "stopping";

export type CheckAllStopKind =
  | "captcha"
  | "auth"
  | "offline"
  | "persist"
  | "cancelled"
  | "lock";

export interface CheckAllProgress {
  index: number;
  total: number;
  courseId: string;
  phase: CheckAllPhase;
  fetchStartedAt?: number;
}

export interface CheckAllCursor {
  startedAt: string;
  completedCourseIds: string[];
  status: "in_progress" | "incomplete" | "complete";
}

export interface CheckAllSummary {
  scanned: number;
  total: number;
  upserted: number;
  failedNames: string[];
  stoppedReason?: CheckAllStopKind;
  incomplete: boolean;
}

/** Durable last בדוק הכל / בדיקת שאלות חדשות run (localStorage). */
export interface LastCheckAllRun {
  completedAt: string;
  scanned: number;
  total: number;
  upserted: number;
  incomplete: boolean;
}

interface CheckAllLock {
  tabId: string;
  at: number;
}

function isSandboxCourse(course: CourseEntry): boolean {
  return course.id.includes("TAUonline_sandbox");
}

/** Courses included in בדוק הכל (skips the sandbox so the run does not open on a dummy course). */
export function checkAllCourseList(courses: CourseEntry[]): CourseEntry[] {
  return courses.filter((course) => !isSandboxCourse(course));
}

export function isCaptchaError(message: string): boolean {
  return (
    message.includes("human verification") ||
    message.includes("CAPTCHA") ||
    message.toLowerCase().includes("captcha")
  );
}

export function isAuthError(message: string): boolean {
  return (
    message.includes("401") ||
    message.toLowerCase().includes("authentication failed")
  );
}

export function isOfflineError(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes("failed to fetch") ||
    lower.includes("networkerror") ||
    lower.includes("network request failed") ||
    lower.includes("load failed") ||
    lower.includes("the internet connection appears to be offline")
  );
}

export function classifyCheckAllStop(
  message: string
): Exclude<CheckAllStopKind, "persist" | "cancelled" | "lock"> | null {
  if (isCaptchaError(message)) return "captcha";
  if (isOfflineError(message)) return "offline";
  if (isAuthError(message)) return "auth";
  return null;
}

export function isBrowserOffline(): boolean {
  return typeof navigator !== "undefined" && navigator.onLine === false;
}

export function hasIncompleteCheckAll(
  cursor: CheckAllCursor | null,
  courseIds: string[]
): boolean {
  if (!cursor || cursor.status === "complete") return false;
  const known = new Set(courseIds);
  const done = cursor.completedCourseIds.filter((id) => known.has(id));
  return done.length < courseIds.length;
}

function isCursor(value: unknown): value is CheckAllCursor {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.startedAt === "string" &&
    Array.isArray(record.completedCourseIds) &&
    (record.status === "in_progress" ||
      record.status === "incomplete" ||
      record.status === "complete")
  );
}

export function loadCheckAllCursor(): CheckAllCursor | null {
  try {
    const raw = sessionStorage.getItem(CHECK_ALL_CURSOR_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return isCursor(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function saveCheckAllCursor(cursor: CheckAllCursor): void {
  try {
    sessionStorage.setItem(CHECK_ALL_CURSOR_KEY, JSON.stringify(cursor));
  } catch {
    // ignore quota / private mode
  }
}

export function clearCheckAllCursor(): void {
  try {
    sessionStorage.removeItem(CHECK_ALL_CURSOR_KEY);
  } catch {
    // ignore
  }
}

function isLastCheckAllRun(value: unknown): value is LastCheckAllRun {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.completedAt === "string" &&
    typeof record.scanned === "number" &&
    typeof record.total === "number" &&
    typeof record.upserted === "number" &&
    typeof record.incomplete === "boolean"
  );
}

export function loadLastCheckAllRun(): LastCheckAllRun | null {
  try {
    const raw = localStorage.getItem(LAST_CHECK_ALL_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return isLastCheckAllRun(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function saveLastCheckAllRun(run: LastCheckAllRun): void {
  try {
    localStorage.setItem(LAST_CHECK_ALL_KEY, JSON.stringify(run));
  } catch {
    // ignore quota / private mode
  }
}

export function lastCheckAllFromSummary(
  summary: CheckAllSummary
): LastCheckAllRun {
  return {
    completedAt: new Date().toISOString(),
    scanned: summary.scanned,
    total: summary.total,
    upserted: summary.upserted,
    incomplete: summary.incomplete,
  };
}

function readLock(): CheckAllLock | null {
  try {
    const raw = localStorage.getItem(CHECK_ALL_LOCK_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (
      !parsed ||
      typeof parsed !== "object" ||
      typeof (parsed as CheckAllLock).tabId !== "string" ||
      typeof (parsed as CheckAllLock).at !== "number"
    ) {
      return null;
    }
    return parsed as CheckAllLock;
  } catch {
    return null;
  }
}

export function tryAcquireCheckAllLock(tabId: string): boolean {
  try {
    const existing = readLock();
    if (
      existing &&
      existing.tabId !== tabId &&
      Date.now() - existing.at < CHECK_ALL_LOCK_STALE_MS
    ) {
      return false;
    }
    localStorage.setItem(
      CHECK_ALL_LOCK_KEY,
      JSON.stringify({ tabId, at: Date.now() } satisfies CheckAllLock)
    );
    return true;
  } catch {
    return true;
  }
}

export function refreshCheckAllLock(tabId: string): void {
  try {
    localStorage.setItem(
      CHECK_ALL_LOCK_KEY,
      JSON.stringify({ tabId, at: Date.now() } satisfies CheckAllLock)
    );
  } catch {
    // ignore
  }
}

export function releaseCheckAllLock(tabId: string): void {
  try {
    const existing = readLock();
    if (existing && existing.tabId !== tabId) return;
    localStorage.removeItem(CHECK_ALL_LOCK_KEY);
  } catch {
    // ignore
  }
}

export function checkAllStopMessage(kind: CheckAllStopKind): string {
  switch (kind) {
    case "captcha":
      return "הבדיקה נעצרה בגלל אימות אנושי (CAPTCHA). הקורסים שכבר נשמרו נשארו. השלימו את האימות בדפדפן, חדשו עוגיות, ואז לחצו המשך בדיקה.";
    case "auth":
      return "הבדיקה נעצרה — העוגיות לא התקבלו (401). רעננו JWT ב-app.campus.gov.il/discussions והדביקו שוב בהגדרות.";
    case "offline":
      return "הבדיקה נעצרה — אין חיבור לרשת. הקורסים שכבר נשמרו נשארו.";
    case "persist":
      return "הבדיקה נעצרה — לא ניתן לשמור את השרשורים בדפדפן.";
    case "cancelled":
      return "הבדיקה הופסקה. הקורסים שכבר נשמרו נשארו.";
    case "lock":
      return "בדיקה כבר רצה בטאב אחר.";
  }
}

export function formatElapsedHe(ms: number): string {
  const sec = Math.max(0, Math.floor(ms / 1000));
  return `כבר ${sec} שנ׳`;
}

export async function waitCheckAllGap(
  ms: number,
  isCancelled: () => boolean
): Promise<void> {
  const started = Date.now();
  while (!isCancelled() && Date.now() - started < ms) {
    const remaining = ms - (Date.now() - started);
    await new Promise<void>((resolve) => {
      window.setTimeout(resolve, Math.min(150, Math.max(0, remaining)));
    });
  }
}
