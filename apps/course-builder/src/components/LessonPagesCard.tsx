import { useEffect, useState } from "react";
import type { CourseViewMode, Page, PageType } from "../lib/types";
import { PAGE_TYPE_LABEL, PAGE_TYPE_LOGO } from "../lib/types";
import { ChevronDownIcon, EyeOffIcon, LockIcon } from "./icons";

interface LessonPagesCardProps {
  title: string;
  pages: Page[];
  pageTypes: Map<string, PageType>;
  mode: CourseViewMode;
  onSelectPage: (pageId: string) => void;
  /** Optional: click lesson title (header text) — e.g. open lesson overview. */
  onSelectLesson?: () => void;
  /** Lesson open date (YYYY-MM-DD); when set, shows a "זמין החל מ" tag under the title. */
  opensAt?: string | null;
  /** Expand state defaults to true; reset when `resetKey` changes. */
  resetKey?: string;
}

function formatDateHe(isoDate: string | null | undefined): string | null {
  if (!isoDate?.trim()) return null;
  // date columns come as YYYY-MM-DD; parse as local calendar day
  const [y, m, d] = isoDate.split("-").map(Number);
  if (!y || !m || !d) return isoDate;
  return new Date(y, m - 1, d).toLocaleDateString("he-IL", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

/** Moodle-style collapsible topic card listing a lesson's pages. */
export function LessonPagesCard({
  title,
  pages,
  pageTypes,
  mode,
  onSelectPage,
  onSelectLesson,
  opensAt,
  resetKey,
}: LessonPagesCardProps) {
  const isImplement = mode === "implement";
  const [expanded, setExpanded] = useState(true);
  const opensLabel = formatDateHe(opensAt);

  useEffect(() => {
    setExpanded(true);
  }, [resetKey]);

  return (
    <div className="rounded-xl border border-surface-200 bg-white overflow-hidden shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
      <div className="flex items-start gap-3 px-4 py-3.5 border-b border-surface-100">
        <button
          type="button"
          className="flex items-center justify-center w-8 h-8 rounded-full bg-[#E8F2FB] text-[#0F6CBF] shrink-0 hover:bg-[#d7e9f8] transition-colors duration-fast mt-0.5"
          aria-expanded={expanded}
          aria-label={expanded ? "כווץ רשימת עמודים" : "הרחב רשימת עמודים"}
          onClick={() => setExpanded((open) => !open)}
        >
          <ChevronDownIcon
            className={`w-4 h-4 transition-transform duration-fast ${
              expanded ? "" : "-rotate-90"
            }`}
          />
        </button>
        <div className="flex-1 min-w-0 flex flex-col gap-1.5">
          {onSelectLesson ? (
            <button
              type="button"
              className="w-full text-start text-base font-bold text-surface-900 truncate hover:text-[#0F6CBF] transition-colors duration-fast"
              onClick={onSelectLesson}
            >
              {title}
            </button>
          ) : (
            <h2 className="text-base font-bold text-surface-900 truncate">
              {title}
            </h2>
          )}
          {opensLabel && (
            <span className="inline-flex w-fit items-center gap-1.5 px-2 py-0.5 rounded-md bg-surface-100 text-xs text-surface-600">
              <LockIcon className="w-3.5 h-3.5" />
              זמין החל מ <span className="font-bold">{opensLabel}</span>
            </span>
          )}
        </div>
      </div>

      {expanded && (
        <ul className="flex flex-col">
          {pages.length === 0 ? (
            <li className="px-4 py-5 text-base text-surface-400">
              אין עדיין עמודים בשיעור.
            </li>
          ) : (
            pages.map((page, index) => {
              const pageType = pageTypes.get(page.id) ?? "page";
              const hiddenFromImplement =
                page.workflow_status === "in_progress";
              const blocked = isImplement && hiddenFromImplement;
              return (
                <li
                  key={page.id}
                  className={`flex items-start gap-3 px-4 py-3.5 transition-colors duration-fast ${
                    index < pages.length - 1 ? "border-b border-surface-100" : ""
                  } ${blocked ? "opacity-50" : "hover:bg-[#F5F8FB]"}`}
                >
                  <img
                    src={PAGE_TYPE_LOGO[pageType]}
                    alt=""
                    title={PAGE_TYPE_LABEL[pageType]}
                    className="w-5 h-5 mt-0.5 shrink-0 object-contain"
                  />
                  <div className="flex-1 min-w-0 flex flex-col gap-1.5">
                    {blocked ? (
                      <span className="text-base text-surface-500 truncate">
                        {page.title}
                      </span>
                    ) : (
                      <button
                        type="button"
                        className="text-start text-base text-[#0F6CBF] hover:underline truncate"
                        onClick={() => onSelectPage(page.id)}
                      >
                        {page.title}
                      </button>
                    )}
                    {hiddenFromImplement && (
                      <span className="inline-flex w-fit items-center gap-1.5 px-2 py-0.5 rounded-md bg-surface-100 text-xs text-surface-600">
                        <EyeOffIcon className="w-3.5 h-3.5" />
                        מוסתר מהטמעה
                      </span>
                    )}
                  </div>
                </li>
              );
            })
          )}
        </ul>
      )}
    </div>
  );
}
