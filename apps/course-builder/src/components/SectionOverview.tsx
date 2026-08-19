import { useEffect, useRef, useState } from "react";
import type {
  CourseViewMode,
  Page,
  PageType,
  PageWorkflowStatus,
  Section,
} from "../lib/types";
import { PAGE_TYPE_LABEL, PAGE_TYPE_LOGO } from "../lib/types";
import * as api from "../lib/api";
import { useSaveStatus } from "../lib/saveStatus";
import { ChevronDownIcon, EyeOffIcon } from "./icons";
import { LessonFilesButton } from "./LessonFilesButton";
import { LessonWorkflowStatusToggle } from "./StatusBadge";

const SAVE_DEBOUNCE_MS = 700;

type SectionFields = Pick<
  Section,
  "title" | "opens_at" | "assignments_due_at" | "files_folder_url"
>;

function formatDateHe(isoDate: string | null): string | null {
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

function emptyToNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

interface SectionOverviewProps {
  section: Section;
  mode: CourseViewMode;
  pages: Page[];
  pageTypes: Map<string, PageType>;
  numbering: Map<string, string>;
  onSelectPage: (pageId: string) => void;
  onSectionChange: (fields: Partial<SectionFields>) => void;
  onPagesWorkflowStatusChange: (status: PageWorkflowStatus) => void;
  onContentChange: () => void;
}

export function SectionOverview({
  section,
  mode,
  pages,
  pageTypes,
  numbering,
  onSelectPage,
  onSectionChange,
  onPagesWorkflowStatusChange,
  onContentChange,
}: SectionOverviewProps) {
  const { trackSave, beginSave, endSave } = useSaveStatus();
  const editable = mode === "edit";
  const isImplement = mode === "implement";
  const [error, setError] = useState<string | null>(null);
  const [pagesExpanded, setPagesExpanded] = useState(true);
  const [workflowSaving, setWorkflowSaving] = useState(false);
  const timers = useRef(new Map<string, number>());

  useEffect(() => {
    setPagesExpanded(true);
  }, [section.id]);

  useEffect(() => {
    return () => {
      for (const t of timers.current.values()) window.clearTimeout(t);
      timers.current.clear();
    };
  }, [section.id]);

  function scheduleSave(key: string, save: () => Promise<void>) {
    const existing = timers.current.get(key);
    if (existing) window.clearTimeout(existing);
    beginSave(key);
    timers.current.set(
      key,
      window.setTimeout(() => {
        timers.current.delete(key);
        trackSave(save())
          .catch((e: Error) => setError(e.message))
          .finally(() => endSave(key));
      }, SAVE_DEBOUNCE_MS)
    );
  }

  function patchField<K extends keyof SectionFields>(
    key: K,
    value: SectionFields[K]
  ) {
    onSectionChange({ [key]: value });
    scheduleSave(`section-${key}:${section.id}`, async () => {
      await api.updateSection(section.id, { [key]: value });
      onContentChange();
    });
  }

  const opensLabel = formatDateHe(section.opens_at);
  const dueLabel = formatDateHe(section.assignments_due_at);
  const folderUrl = section.files_folder_url?.trim() || null;
  const lessonWorkflowStatus: PageWorkflowStatus =
    pages.length > 0 &&
    pages.every(
      (page) => page.workflow_status === "ready_for_implementation"
    )
      ? "ready_for_implementation"
      : "in_progress";

  async function toggleLessonWorkflowStatus() {
    if (pages.length === 0 || workflowSaving) return;
    const nextStatus: PageWorkflowStatus =
      lessonWorkflowStatus === "ready_for_implementation"
        ? "in_progress"
        : "ready_for_implementation";
    setWorkflowSaving(true);
    setError(null);
    try {
      await trackSave(
        api.updateSectionPagesWorkflowStatus(section.id, nextStatus)
      );
      onPagesWorkflowStatusChange(nextStatus);
      onContentChange();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setWorkflowSaving(false);
    }
  }

  return (
    <div className="flex flex-col max-w-3xl w-full mx-auto ps-12 pe-6 py-6">
      <div className="flex flex-col gap-1 mb-6">
        <div className="flex items-center gap-3">
          {editable ? (
            <input
              value={section.title}
              placeholder="שם השיעור"
              onChange={(e) => patchField("title", e.target.value)}
              className="flex-1 min-w-0 text-3xl font-semibold tracking-tight text-surface-900 bg-transparent outline-none border-b border-transparent transition-colors duration-fast"
            />
          ) : (
            <h1 className="flex-1 min-w-0 text-3xl font-semibold tracking-tight text-surface-900 truncate">
              {section.title}
            </h1>
          )}
          {editable && (
            <LessonWorkflowStatusToggle
              status={lessonWorkflowStatus}
              onClick={toggleLessonWorkflowStatus}
              disabled={pages.length === 0 || workflowSaving}
            />
          )}
        </div>
        <p className="text-sm text-surface-500">הגדרות וקבצים</p>
      </div>

      {error && (
        <div className="mb-4 border border-danger bg-red-50 px-3 py-2">
          <p className="text-base text-danger">{error}</p>
        </div>
      )}

      <div className="flex flex-col gap-5">
        {editable ? (
          <>
            <Field label="לינק לתיקיית קבצים של השיעור">
              <input
                type="url"
                dir="ltr"
                value={section.files_folder_url ?? ""}
                placeholder="https://..."
                onChange={(e) =>
                  patchField("files_folder_url", emptyToNull(e.target.value))
                }
                className="w-full px-3 py-2 text-base leading-6 bg-surface-50 border border-surface-200 text-surface-900 placeholder:text-surface-400 outline-none"
              />
            </Field>
            <Field label="תאריך פתיחה">
              <input
                type="date"
                value={section.opens_at ?? ""}
                onChange={(e) =>
                  patchField("opens_at", emptyToNull(e.target.value))
                }
                className="w-full max-w-xs px-3 py-2 text-base leading-6 bg-surface-50 border border-surface-200 text-surface-900 outline-none"
              />
            </Field>
            <Field label="תאריך אחרון להגשת מטלות/תרגילים">
              <input
                type="date"
                value={section.assignments_due_at ?? ""}
                onChange={(e) =>
                  patchField("assignments_due_at", emptyToNull(e.target.value))
                }
                className="w-full max-w-xs px-3 py-2 text-base leading-6 bg-surface-50 border border-surface-200 text-surface-900 outline-none"
              />
            </Field>
          </>
        ) : (
          <>
            {folderUrl && isImplement ? (
              <LessonFilesButton url={folderUrl} />
            ) : folderUrl ? (
              <div className="flex flex-col gap-1">
                <span className="text-sm font-semibold text-surface-700">
                  לינק לתיקיית קבצים של השיעור
                </span>
                <a
                  href={folderUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  dir="ltr"
                  className="text-base text-[#0F6CBF] hover:underline break-all"
                >
                  {folderUrl}
                </a>
              </div>
            ) : null}
            {opensLabel && (
              <ReadRow label="תאריך פתיחה" value={opensLabel} />
            )}
            {dueLabel && (
              <ReadRow
                label="תאריך אחרון להגשת מטלות/תרגילים"
                value={dueLabel}
              />
            )}
            {!opensLabel && !dueLabel && !folderUrl && (
              <p className="text-base text-surface-400">
                אין עדיין מידע על השיעור.
              </p>
            )}
          </>
        )}
      </div>

      {/* Moodle-style lesson activity list */}
      <div className="mt-8 rounded-xl border border-surface-200 bg-white overflow-hidden shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
        <div className="flex items-center gap-3 px-4 py-3.5 border-b border-surface-100">
          <button
            type="button"
            className="flex items-center justify-center w-8 h-8 rounded-full bg-[#E8F2FB] text-[#0F6CBF] shrink-0 hover:bg-[#d7e9f8] transition-colors duration-fast"
            aria-expanded={pagesExpanded}
            aria-label={pagesExpanded ? "כווץ רשימת עמודים" : "הרחב רשימת עמודים"}
            onClick={() => setPagesExpanded((open) => !open)}
          >
            <ChevronDownIcon
              className={`w-4 h-4 transition-transform duration-fast ${
                pagesExpanded ? "" : "-rotate-90"
              }`}
            />
          </button>
          <h2 className="flex-1 min-w-0 text-base font-bold text-surface-900 truncate">
            {section.title}
          </h2>
        </div>

        {pagesExpanded && (
          <ul className="flex flex-col">
            {pages.length === 0 ? (
              <li className="px-4 py-5 text-base text-surface-400">
                אין עדיין עמודים בשיעור.
              </li>
            ) : (
              pages.map((page, index) => {
                const pageType = pageTypes.get(page.id) ?? "page";
                const pageNumber = numbering.get(page.id);
                const hiddenFromImplement =
                  page.workflow_status === "in_progress";
                const blocked = isImplement && hiddenFromImplement;
                const titleLabel = pageNumber
                  ? `${pageNumber} | ${page.title}`
                  : page.title;
                return (
                  <li
                    key={page.id}
                    className={`flex items-start gap-3 px-4 py-3.5 transition-colors duration-fast ${
                      index < pages.length - 1 ? "border-b border-surface-100" : ""
                    } ${
                      blocked
                        ? "opacity-50"
                        : "hover:bg-[#F5F8FB]"
                    }`}
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
                          {titleLabel}
                        </span>
                      ) : (
                        <button
                          type="button"
                          className="text-start text-base text-[#0F6CBF] hover:underline truncate"
                          onClick={() => onSelectPage(page.id)}
                        >
                          {titleLabel}
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
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm font-semibold text-surface-700">{label}</span>
      {children}
    </label>
  );
}

function ReadRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-sm font-semibold text-surface-700">{label}</span>
      <p className="text-base text-surface-900">{value}</p>
    </div>
  );
}
