import { useEffect, useRef, useState, type ReactNode } from "react";
import type {
  CourseViewMode,
  Page,
  PageType,
  PageWorkflowStatus,
  Section,
} from "../lib/types";
import * as api from "../lib/api";
import { validateLessonQuestions } from "../lib/questionValidation";
import { useSaveStatus } from "../lib/saveStatus";
import { BannerBlock } from "./blocks/BannerBlock";
import { FilmIcon, FolderIcon } from "./icons";
import { LessonFilesButton, LessonVideosButton } from "./LessonFilesButton";
import { LessonPagesCard } from "./LessonPagesCard";
import { LessonWorkflowStatusToggle } from "./StatusBadge";

const SAVE_DEBOUNCE_MS = 700;

type SectionFields = Pick<
  Section,
  | "title"
  | "opens_at"
  | "assignments_due_at"
  | "files_folder_url"
  | "videos_folder_url"
  | "banner_image_url"
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
  onSelectPage: (pageId: string) => void;
  /** Edit mode: add a page to this lesson from the main overview. */
  onAddPage?: () => void;
  onSectionChange: (fields: Partial<SectionFields>) => void;
  onPagesWorkflowStatusChange: (status: PageWorkflowStatus) => void;
  onContentChange: () => void;
}

export function SectionOverview({
  section,
  mode,
  pages,
  pageTypes,
  onSelectPage,
  onAddPage,
  onSectionChange,
  onPagesWorkflowStatusChange,
  onContentChange,
}: SectionOverviewProps) {
  const { trackSave, beginSave, endSave } = useSaveStatus();
  const editable = mode === "edit";
  const isImplement = mode === "implement";
  const [error, setError] = useState<string | null>(null);
  const [workflowSaving, setWorkflowSaving] = useState(false);
  const timers = useRef(new Map<string, number>());

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

  function patchBannerUrl(value: string | null) {
    onSectionChange({ banner_image_url: value });
    scheduleSave(`section-banner_image_url:${section.id}`, async () => {
      await api.updateSection(section.id, { banner_image_url: value });
      await api.syncSectionBannerToPages(section.id, value);
      onContentChange();
    });
  }

  const opensLabel = formatDateHe(section.opens_at);
  const dueLabel = formatDateHe(section.assignments_due_at);
  const folderUrl = section.files_folder_url?.trim() || null;
  const videosUrl = section.videos_folder_url?.trim() || null;
  const bannerUrl = section.banner_image_url?.trim() || null;
  const lessonWorkflowStatus: PageWorkflowStatus =
    pages.length > 0 &&
    pages.every(
      (page) => page.workflow_status === "ready_for_implementation"
    )
      ? "ready_for_implementation"
      : "in_progress";

  async function setLessonWorkflowStatus(nextStatus: PageWorkflowStatus) {
    if (pages.length === 0 || workflowSaving) return;
    if (nextStatus === lessonWorkflowStatus) return;

    setWorkflowSaving(true);
    setError(null);
    try {
      if (nextStatus === "ready_for_implementation") {
        const components = await api.listComponentsForPages(
          pages.map((page) => page.id)
        );
        const byPage = new Map<string, typeof components>();
        for (const component of components) {
          const list = byPage.get(component.page_id) ?? [];
          list.push(component);
          byPage.set(component.page_id, list);
        }
        const message = validateLessonQuestions(
          pages.map((page) => ({
            title: page.title,
            components: byPage.get(page.id) ?? [],
          }))
        );
        if (message) {
          window.alert(message);
          return;
        }
      }

      const nextLabel =
        nextStatus === "ready_for_implementation" ? "מוכן להטמעה" : "בעבודה";
      if (
        !window.confirm(
          `האם לשנות את הסטטוס של כל עמודי השיעור ל"${nextLabel}"?`
        )
      ) {
        return;
      }

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

  const hasReadSettings =
    !!opensLabel || !!dueLabel || !!folderUrl || !!videosUrl || !!bannerUrl;

  const fieldInputClass =
    "w-full px-3 py-2 text-base leading-6 bg-white border border-surface-200 text-surface-900 placeholder:text-surface-400 outline-none";

  return (
    <div className="flex flex-col max-w-3xl w-full mx-auto ps-12 pe-6 py-6">
      <div className="flex items-center gap-3 mb-6">
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
            onSelect={setLessonWorkflowStatus}
            disabled={pages.length === 0 || workflowSaving}
          />
        )}
      </div>

      {error && (
        <div className="mb-4 border border-danger bg-red-50 px-3 py-2">
          <p className="text-base text-danger">{error}</p>
        </div>
      )}

      {(editable || hasReadSettings || isImplement) && (
        <section className="rounded-xl bg-surface-100 px-5 py-4 flex flex-col gap-4">
          <h2 className="text-base font-semibold text-surface-900">
            הגדרות השיעור
          </h2>

          {editable ? (
            <>
              <Field
                label="לינק לתיקיית קבצים של השיעור"
                icon={<FolderIcon className="w-4 h-4 text-surface-500" />}
              >
                <input
                  type="url"
                  dir="ltr"
                  value={section.files_folder_url ?? ""}
                  placeholder="https://..."
                  onChange={(e) =>
                    patchField("files_folder_url", emptyToNull(e.target.value))
                  }
                  className={fieldInputClass}
                />
              </Field>
              <Field
                label="לינק לתיקיית סרטונים של השיעור"
                icon={<FilmIcon className="w-4 h-4 text-surface-500" />}
              >
                <input
                  type="url"
                  dir="ltr"
                  value={section.videos_folder_url ?? ""}
                  placeholder="https://..."
                  onChange={(e) =>
                    patchField("videos_folder_url", emptyToNull(e.target.value))
                  }
                  className={fieldInputClass}
                />
              </Field>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="תאריך פתיחה">
                  <input
                    type="date"
                    value={section.opens_at ?? ""}
                    onChange={(e) =>
                      patchField("opens_at", emptyToNull(e.target.value))
                    }
                    className={fieldInputClass}
                  />
                </Field>
                <Field label="תאריך אחרון להגשת מטלות/תרגילים">
                  <input
                    type="date"
                    value={section.assignments_due_at ?? ""}
                    onChange={(e) =>
                      patchField(
                        "assignments_due_at",
                        emptyToNull(e.target.value)
                      )
                    }
                    className={fieldInputClass}
                  />
                </Field>
              </div>
              <div className="flex flex-col gap-2 border-t border-surface-200 pt-4">
                <Field label="באנר השיעור">
                  <input
                    type="url"
                    dir="ltr"
                    value={section.banner_image_url ?? ""}
                    placeholder="https://..."
                    onChange={(e) =>
                      patchBannerUrl(emptyToNull(e.target.value))
                    }
                    className={fieldInputClass}
                  />
                </Field>
                <p className="text-xs text-surface-500">
                  הבאנר יוחל אוטומטית על כל עמודי השיעור
                </p>
                <BannerBlock
                  props={{ imageUrl: bannerUrl ?? undefined }}
                  mode="edit"
                  pageTitle={section.title}
                  onChange={() => {}}
                />
              </div>
            </>
          ) : (
            <>
              {isImplement && (folderUrl || videosUrl) ? (
                <div className="flex flex-wrap gap-2">
                  {folderUrl && <LessonFilesButton url={folderUrl} />}
                  {videosUrl && <LessonVideosButton url={videosUrl} />}
                </div>
              ) : (
                <>
                  {folderUrl && (
                    <div className="flex flex-col gap-1">
                      <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-surface-700">
                        <FolderIcon className="w-4 h-4 text-surface-500" />
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
                  )}
                  {videosUrl && (
                    <div className="flex flex-col gap-1">
                      <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-surface-700">
                        <FilmIcon className="w-4 h-4 text-surface-500" />
                        לינק לתיקיית סרטונים של השיעור
                      </span>
                      <a
                        href={videosUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        dir="ltr"
                        className="text-base text-[#0F6CBF] hover:underline break-all"
                      >
                        {videosUrl}
                      </a>
                    </div>
                  )}
                </>
              )}
              {(opensLabel || dueLabel) && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {opensLabel && (
                    <ReadRow label="תאריך פתיחה" value={opensLabel} />
                  )}
                  {dueLabel && (
                    <ReadRow
                      label="תאריך אחרון להגשת מטלות/תרגילים"
                      value={dueLabel}
                    />
                  )}
                </div>
              )}
              {bannerUrl && (
                <div className="flex flex-col gap-2 border-t border-surface-200 pt-4">
                  <span className="text-sm font-semibold text-surface-700">
                    באנר השיעור
                  </span>
                  <BannerBlock
                    props={{ imageUrl: bannerUrl }}
                    mode={mode}
                    pageTitle={section.title}
                    onChange={() => {}}
                  />
                </div>
              )}
              {!hasReadSettings && (
                <p className="text-base text-surface-400">
                  אין עדיין מידע על השיעור.
                </p>
              )}
            </>
          )}
        </section>
      )}

      <div className="mt-8">
        <LessonPagesCard
          title={section.title}
          pages={pages}
          pageTypes={pageTypes}
          mode={mode}
          onSelectPage={onSelectPage}
          onAddPage={editable ? onAddPage : undefined}
          resetKey={section.id}
        />
      </div>
    </div>
  );
}

function Field({
  label,
  icon,
  children,
}: {
  label: string;
  icon?: ReactNode;
  children: ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-surface-700">
        {icon}
        {label}
      </span>
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
