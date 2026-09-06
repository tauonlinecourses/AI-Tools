import { useEffect, useMemo, useRef } from "react";
import { Spinner } from "@workspace/ui";
import type { CourseEntry } from "../lib/courses";
import type { CheckAllPhase } from "../lib/checkAllRun";

export const INBOX_SELECTION = "__inbox__";

export type CourseCacheEntry =
  | { status: "loading" | "syncing"; lastCheckedAt?: string | null }
  | { status: "error"; message: string; lastCheckedAt?: string | null }
  | {
      status: "ready";
      unansweredCount: number;
      newCount?: number;
      lastCheckedAt?: string | null;
    }
  | { status: "idle"; lastCheckedAt?: string | null };

export interface CheckAllSidebarState {
  courseId: string | null;
  phase: CheckAllPhase;
  elapsedSeconds?: number;
}

interface CourseSidebarProps {
  courses: CourseEntry[];
  /** Course id, `INBOX_SELECTION`, or null. */
  selectedId: string | null;
  cache: Record<string, CourseCacheEntry>;
  inboxNewCount: number;
  onSelectInbox: () => void;
  onSelect: (courseId: string) => void;
  /** Snapshot of sidebar order for the duration of a check-all run. */
  frozenCourseIds?: string[] | null;
  checkAll?: CheckAllSidebarState | null;
}

function formatLastCheckedDate(iso?: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("he-IL");
}

function MessageIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  );
}

export function CourseSidebar({
  courses,
  selectedId,
  cache,
  inboxNewCount,
  onSelectInbox,
  onSelect,
  frozenCourseIds,
  checkAll,
}: CourseSidebarProps) {
  const inboxSelected = selectedId === INBOX_SELECTION;
  const rowRefs = useRef<Record<string, HTMLLIElement | null>>({});

  const sortedCourses = useMemo(() => {
    if (frozenCourseIds && frozenCourseIds.length > 0) {
      const byId = new Map(courses.map((course) => [course.id, course]));
      return frozenCourseIds
        .map((id) => byId.get(id))
        .filter((course): course is CourseEntry => Boolean(course));
    }

    const withUnanswered: CourseEntry[] = [];
    const withoutUnanswered: CourseEntry[] = [];
    for (const course of courses) {
      const entry = cache[course.id];
      const hasUnanswered =
        entry?.status === "ready" && entry.unansweredCount > 0;
      if (hasUnanswered) {
        withUnanswered.push(course);
      } else {
        withoutUnanswered.push(course);
      }
    }
    // Preserve original list order within each group.
    return [...withUnanswered, ...withoutUnanswered];
  }, [courses, cache, frozenCourseIds]);

  const activeCourseId = checkAll?.courseId ?? null;

  useEffect(() => {
    if (!activeCourseId) return;
    rowRefs.current[activeCourseId]?.scrollIntoView({
      block: "nearest",
      behavior: "smooth",
    });
  }, [activeCourseId]);

  return (
    <aside
      dir="rtl"
      className="relative z-10 flex w-full shrink-0 flex-col border-surface-200 bg-white md:w-[34%] md:border-e md:shadow-[-3px_0_4px_-2px_rgba(0,0,0,0.12)]"
    >
      <ul className="min-h-0 flex-1 overflow-y-auto">
        <li className="border-b border-surface-200">
          <button
            type="button"
            onClick={onSelectInbox}
            className={`flex w-full flex-col gap-1 px-3 py-3 text-right transition-colors ${
              inboxSelected ? "bg-blue-50" : "bg-transparent hover:bg-black/[0.04]"
            }`}
          >
            <span
              className={`flex items-center justify-between gap-2 text-sm font-semibold leading-snug ${
                inboxSelected ? "text-blue-800" : "text-blue-700"
              }`}
            >
              <span>פיד של כל הקורסים</span>
              {inboxNewCount > 0 ? (
                <span className="rounded-full bg-blue-600 px-2 py-0.5 text-[11px] font-semibold text-white">
                  {inboxNewCount} חדש
                </span>
              ) : null}
            </span>
            <span className="mt-0.5 flex items-center gap-2 text-xs text-surface-500">
              <span className="flex items-center gap-1">
                <MessageIcon className="text-surface-400" />
                <span>כל הקורסים</span>
              </span>
            </span>
          </button>
        </li>

        {sortedCourses.map((course) => {
          const entry = cache[course.id];
          const selected = selectedId === course.id;
          const title = course.nameHe || course.name;
          const lastCheckedLabel = formatLastCheckedDate(entry?.lastCheckedAt);
          const fetching =
            Boolean(checkAll?.courseId) && checkAll?.courseId === course.id;
          const syncing =
            !fetching &&
            (entry?.status === "loading" || entry?.status === "syncing");

          let rowClass = "bg-transparent hover:bg-black/[0.04]";
          if (fetching) {
            rowClass = "bg-amber-50 hover:bg-amber-50";
          } else if (selected) {
            rowClass = "bg-blue-50 hover:bg-blue-50";
          }

          return (
            <li
              key={course.id}
              ref={(node) => {
                rowRefs.current[course.id] = node;
              }}
              className="border-b border-surface-200"
            >
              <button
                type="button"
                onClick={() => onSelect(course.id)}
                className={`flex w-full flex-col gap-1 px-3 py-3 text-right transition-colors ${rowClass}`}
              >
                <span className="flex items-start justify-between gap-2">
                  <span
                    className={`min-w-0 text-sm font-semibold leading-snug ${
                      fetching
                        ? "text-amber-950"
                        : selected
                          ? "text-blue-800"
                          : "text-blue-700"
                    }`}
                  >
                    {title}
                  </span>
                  <span className="flex shrink-0 items-center gap-1.5 pt-0.5 text-xs text-surface-500">
                    {entry?.status === "ready" && (entry.newCount ?? 0) > 0 ? (
                      <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[11px] font-semibold text-blue-800">
                        {entry.newCount}
                      </span>
                    ) : null}
                    <span className="flex items-center gap-1">
                      {fetching ? (
                        <span className="inline-flex items-center gap-1 font-semibold text-amber-800">
                          <Spinner size="sm" />
                          <span>בודק כעת</span>
                        </span>
                      ) : syncing ? (
                        <span>טוען…</span>
                      ) : entry?.status === "ready" ? (
                        entry.unansweredCount > 0 ? (
                          <span
                            className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-red-600 px-1 text-[11px] font-semibold leading-none text-white"
                            title="הודעות ללא מענה בטעינה האחרונה"
                          >
                            {entry.unansweredCount}
                          </span>
                        ) : (
                          <span title="הודעות ללא מענה בטעינה האחרונה">
                            {entry.unansweredCount}
                          </span>
                        )
                      ) : entry?.status === "error" ? (
                        <span className="text-danger">שגיאה</span>
                      ) : (
                        <span className="text-surface-300">—</span>
                      )}
                    </span>
                  </span>
                </span>
                {fetching && checkAll?.elapsedSeconds != null ? (
                  <span className="text-xs font-medium text-amber-800">
                    כבר {checkAll.elapsedSeconds} שנ׳
                  </span>
                ) : null}
                <span className="text-xs text-surface-400">
                  מעודכן לתאריך:{" "}
                  {lastCheckedLabel ?? (
                    <span className="text-surface-300">—</span>
                  )}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </aside>
  );
}
