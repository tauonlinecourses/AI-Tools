import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { PageLayout, Card, Spinner } from "@workspace/ui";
import type {
  CourseViewMode,
  Page,
  PageType,
  PageWorkflowStatus,
  Section,
  CourseTree,
  StatusRollup,
} from "../lib/types";
import { isHomePage, PAGE_TYPE_LABEL, PAGE_TYPE_LOGO } from "../lib/types";
import * as api from "../lib/api";
import { PageContent } from "./PageContent";
import { SectionOverview } from "./SectionOverview";
import { SortableList, type DragHandleProps } from "./SortableList";
import {
  CalendarIcon,
  ChevronDownIcon,
  DuplicateIcon,
  FolderIcon,
  GripIcon,
  MoreVerticalIcon,
  PencilIcon,
  PlusIcon,
  TrashIcon,
} from "./icons";
import { SaveStatusIndicator, useSaveStatus } from "../lib/saveStatus";

interface CourseShellProps {
  mode: CourseViewMode;
}

type Renaming = { kind: "section" | "page"; id: string } | null;

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("he-IL", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/** True when at least one page in the lesson is ready for implementers. */
function sectionHasReadyPages(pages: Page[]): boolean {
  return pages.some((page) => page.workflow_status === "ready_for_implementation");
}

/** Lesson is ready only when it has pages and every page is ready. */
function sectionWorkflowStatus(pages: Page[]): PageWorkflowStatus {
  return pages.length > 0 &&
    pages.every((page) => page.workflow_status === "ready_for_implementation")
    ? "ready_for_implementation"
    : "in_progress";
}

function SidebarRowMenu({
  open,
  selectedTone = false,
  ariaLabel,
  onToggle,
  onClose,
  items,
}: {
  open: boolean;
  /** When true, use white-on-blue tones (selected page row). */
  selectedTone?: boolean;
  ariaLabel: string;
  onToggle: () => void;
  onClose: () => void;
  items: Array<{
    label: string;
    icon: React.ReactNode;
    danger?: boolean;
    onClick: () => void;
  }>;
}) {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function closeOnOutsideClick(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) onClose();
    }
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("pointerdown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open, onClose]);

  return (
    <div
      ref={rootRef}
      className={`ms-auto relative shrink-0 ${
        open ? "" : "opacity-0 group-hover:opacity-100 focus-within:opacity-100"
      }`}
    >
      <button
        type="button"
        className={`p-1 ${
          open || selectedTone
            ? selectedTone
              ? "text-white/90 hover:text-white"
              : "text-surface-800"
            : "text-surface-600 hover:text-surface-900"
        }`}
        title={ariaLabel}
        aria-label={ariaLabel}
        aria-expanded={open}
        onClick={(e) => {
          e.stopPropagation();
          onToggle();
        }}
      >
        <MoreVerticalIcon className="w-4 h-4" />
      </button>
      {open && (
        <div
          className="absolute top-full end-0 z-50 mt-1 min-w-[9.5rem] border border-surface-200 bg-white py-1 shadow-md"
          role="menu"
          aria-label={ariaLabel}
          onClick={(e) => e.stopPropagation()}
        >
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              className={`w-full flex items-center gap-2 px-2.5 py-1.5 text-sm text-start ${
                item.danger
                  ? "text-danger hover:bg-red-50"
                  : "text-surface-700 hover:bg-surface-100"
              }`}
              onClick={() => {
                onClose();
                item.onClick();
              }}
            >
              {item.icon}
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function CourseShell({ mode }: CourseShellProps) {
  const { courseId } = useParams<{ courseId: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const { trackSave } = useSaveStatus();
  const editable = mode === "edit";
  const showRollups = mode === "implement";

  const [tree, setTree] = useState<CourseTree | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [renaming, setRenaming] = useState<Renaming>(null);
  const [openMenu, setOpenMenu] = useState<
    { kind: "page" | "section"; id: string } | null
  >(null);
  const [rollups, setRollups] = useState<{
    perPage: Map<string, StatusRollup>;
    perSection: Map<string, StatusRollup>;
  } | null>(null);
  const [pageTypes, setPageTypes] = useState<Map<string, PageType>>(new Map());

  useEffect(() => {
    if (!courseId) return;
    api
      .getCourseTree(courseId)
      .then(setTree)
      .catch((e: Error) => setError(e.message));
  }, [courseId]);

  const refreshRollups = useCallback(() => {
    if (!showRollups || !tree) return;
    api
      .getStatusRollups(
        tree.sections.map((s) => s.id),
        tree.pages.map((p) => p.id)
      )
      .then(setRollups)
      .catch(() => undefined);
  }, [showRollups, tree]);

  const refreshPageTypes = useCallback(() => {
    if (!tree) return;
    api
      .getPageTypes(tree.pages.map((p) => p.id))
      .then(setPageTypes)
      .catch(() => undefined);
  }, [tree]);

  useEffect(() => {
    refreshRollups();
  }, [refreshRollups]);

  useEffect(() => {
    refreshPageTypes();
  }, [refreshPageTypes]);

  // ─── Derived structure ────────────────────────────────────────────────────

  const pagesBySection = useMemo(() => {
    const map = new Map<string, Page[]>();
    if (!tree) return map;
    for (const section of tree.sections) map.set(section.id, []);
    for (const page of tree.pages) {
      if (page.section_id) map.get(page.section_id)?.push(page);
    }
    return map;
  }, [tree]);

  const homePage = useMemo(
    () => tree?.pages.find(isHomePage) ?? null,
    [tree]
  );

  const selectedSection = useMemo(() => {
    if (!tree) return null;
    const requested = searchParams.get("section");
    if (!requested) return null;
    const found = tree.sections.find((s) => s.id === requested) ?? null;
    if (!found) return null;
    if (
      mode === "implement" &&
      !sectionHasReadyPages(pagesBySection.get(found.id) ?? [])
    ) {
      return null;
    }
    return found;
  }, [tree, searchParams, mode, pagesBySection]);

  const selectedPage = useMemo(() => {
    if (!tree) return null;
    // Valid section overview takes precedence over page selection.
    if (selectedSection) return null;
    const requested = searchParams.get("page");
    if (requested) {
      const found = tree.pages.find((p) => p.id === requested);
      if (found) {
        return mode === "implement" &&
          found.workflow_status === "in_progress"
          ? null
          : found;
      }
    }
    if (
      homePage &&
      (mode !== "implement" ||
        homePage.workflow_status === "ready_for_implementation")
    ) {
      return homePage;
    }
    for (const section of tree.sections) {
      const pages = pagesBySection.get(section.id) ?? [];
      const firstAvailable = pages.find(
        (page) =>
          mode !== "implement" ||
          page.workflow_status === "ready_for_implementation"
      );
      if (firstAvailable) return firstAvailable;
    }
    return null;
  }, [tree, pagesBySection, searchParams, homePage, selectedSection, mode]);

  const blockedRequestedSection = useMemo(() => {
    if (!tree || mode !== "implement") return null;
    const requested = searchParams.get("section");
    if (!requested) return null;
    const section = tree.sections.find((candidate) => candidate.id === requested);
    if (!section) return null;
    return sectionHasReadyPages(pagesBySection.get(section.id) ?? [])
      ? null
      : section;
  }, [tree, mode, searchParams, pagesBySection]);

  const blockedRequestedPage = useMemo(() => {
    if (!tree || mode !== "implement" || selectedSection || blockedRequestedSection)
      return null;
    const requested = searchParams.get("page");
    if (!requested) return null;
    const page = tree.pages.find((candidate) => candidate.id === requested);
    return page?.workflow_status === "in_progress" ? page : null;
  }, [tree, mode, selectedSection, blockedRequestedSection, searchParams]);

  const numbering = useMemo(() => {
    const map = new Map<string, string>();
    if (!tree) return map;
    // Home page has no lesson numbering — shown by title only.
    tree.sections.forEach((section, sIdx) => {
      map.set(section.id, `${sIdx + 1}`);
      (pagesBySection.get(section.id) ?? []).forEach((page, pIdx) => {
        map.set(page.id, `${sIdx + 1}.${pIdx + 1}`);
      });
    });
    return map;
  }, [tree, pagesBySection]);

  /** Sidebar order: home, then each section's pages. */
  const orderedPages = useMemo(() => {
    if (!tree) return [] as Page[];
    const list: Page[] = [];
    if (homePage) list.push(homePage);
    for (const section of tree.sections) {
      list.push(...(pagesBySection.get(section.id) ?? []));
    }
    return mode === "implement"
      ? list.filter(
          (page) => page.workflow_status === "ready_for_implementation"
        )
      : list;
  }, [tree, homePage, pagesBySection, mode]);

  const adjacentPages = useMemo(() => {
    if (!selectedPage) return { prev: null, next: null };
    const idx = orderedPages.findIndex((p) => p.id === selectedPage.id);
    if (idx < 0) return { prev: null, next: null };
    return {
      prev: idx > 0 ? orderedPages[idx - 1] : null,
      next: idx < orderedPages.length - 1 ? orderedPages[idx + 1] : null,
    };
  }, [orderedPages, selectedPage]);

  function selectPage(pageId: string) {
    setOpenMenu(null);
    setSearchParams({ page: pageId }, { replace: true });
  }

  function selectSection(sectionId: string) {
    setOpenMenu(null);
    setCollapsed((prev) => {
      if (!prev.has(sectionId)) return prev;
      const next = new Set(prev);
      next.delete(sectionId);
      return next;
    });
    setSearchParams({ section: sectionId }, { replace: true });
  }

  /** Refresh sidebar "last updated" after nested content saves (API already bumps DB). */
  const markCourseTouched = useCallback(() => {
    setTree((prev) =>
      prev
        ? {
            ...prev,
            course: { ...prev.course, updated_at: new Date().toISOString() },
          }
        : prev
    );
  }, []);

  // ─── Section mutations ────────────────────────────────────────────────────

  async function handleAddSection() {
    if (!tree || !courseId) return;
    try {
      const section = await trackSave(
        api.addSection(courseId, "שיעור חדש", tree.sections.length)
      );
      setTree((prev) => (prev ? { ...prev, sections: [...prev.sections, section] } : prev));
      markCourseTouched();
      setRenaming({ kind: "section", id: section.id });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function handleRename(kind: "section" | "page", id: string, title: string) {
    setRenaming(null);
    const trimmed = title.trim();
    if (!trimmed) return;
    setTree((prev) => {
      if (!prev) return prev;
      return kind === "section"
        ? { ...prev, sections: prev.sections.map((s) => (s.id === id ? { ...s, title: trimmed } : s)) }
        : { ...prev, pages: prev.pages.map((p) => (p.id === id ? { ...p, title: trimmed } : p)) };
    });
    try {
      if (kind === "section") await trackSave(api.updateSection(id, { title: trimmed }));
      else await trackSave(api.updatePage(id, { title: trimmed }));
      markCourseTouched();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function handleDeleteSection(section: Section) {
    const pageCount = (pagesBySection.get(section.id) ?? []).length;
    const warning =
      pageCount > 0
        ? `למחוק את השיעור "${section.title}" יחד עם ${pageCount} עמודים?`
        : `למחוק את השיעור "${section.title}"?`;
    if (!window.confirm(warning)) return;
    try {
      await trackSave(api.deleteSection(section.id));
      setTree((prev) =>
        prev
          ? {
              ...prev,
              sections: prev.sections.filter((s) => s.id !== section.id),
              pages: prev.pages.filter((p) => p.section_id !== section.id),
            }
          : prev
      );
      markCourseTouched();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function handleDuplicateSection(section: Section) {
    try {
      const { section: created, pages } = await trackSave(
        api.duplicateSection(section.id)
      );
      setTree((prev) => {
        if (!prev) return prev;
        const sorted = [...prev.sections].sort((a, b) => a.position - b.position);
        const idx = sorted.findIndex((s) => s.id === section.id);
        const nextSections = [
          ...sorted.slice(0, idx + 1),
          created,
          ...sorted.slice(idx + 1),
        ].map((s, position) => ({ ...s, position }));
        return {
          ...prev,
          sections: nextSections,
          pages: [...prev.pages, ...pages],
        };
      });
      markCourseTouched();
      setCollapsed((prev) => {
        const next = new Set(prev);
        next.delete(created.id);
        return next;
      });
      if (pages[0]) selectPage(pages[0].id);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  function handleReorderSections(next: Section[]) {
    setTree((prev) => (prev ? { ...prev, sections: next } : prev));
    trackSave(api.reorderSections(next.map((s) => s.id)))
      .then(() => markCourseTouched())
      .catch((e: Error) => setError(e.message));
  }

  // ─── Page mutations ───────────────────────────────────────────────────────

  async function handleAddPage(sectionId: string) {
    const siblings = pagesBySection.get(sectionId) ?? [];
    try {
      const page = await trackSave(api.addPage(sectionId, "עמוד חדש", siblings.length));
      setTree((prev) => (prev ? { ...prev, pages: [...prev.pages, page] } : prev));
      markCourseTouched();
      setRenaming({ kind: "page", id: page.id });
      selectPage(page.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function handleDeletePage(page: Page) {
    if (isHomePage(page)) return;
    if (!window.confirm(`למחוק את העמוד "${page.title}"?`)) return;
    try {
      await trackSave(api.deletePage(page.id));
      setTree((prev) =>
        prev ? { ...prev, pages: prev.pages.filter((p) => p.id !== page.id) } : prev
      );
      markCourseTouched();
      if (searchParams.get("page") === page.id) setSearchParams({}, { replace: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function handleDuplicatePage(page: Page) {
    if (isHomePage(page)) return;
    try {
      const created = await trackSave(api.duplicatePage(page.id));
      setTree((prev) => {
        if (!prev) return prev;
        const siblings = prev.pages
          .filter((p) => p.section_id === page.section_id)
          .sort((a, b) => a.position - b.position);
        const others = prev.pages.filter((p) => p.section_id !== page.section_id);
        const idx = siblings.findIndex((p) => p.id === page.id);
        const nextSiblings = [
          ...siblings.slice(0, idx + 1),
          created,
          ...siblings.slice(idx + 1),
        ].map((p, position) => ({ ...p, position }));
        return { ...prev, pages: [...others, ...nextSiblings] };
      });
      markCourseTouched();
      selectPage(created.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  function handleReorderPages(sectionId: string, next: Page[]) {
    setTree((prev) => {
      if (!prev) return prev;
      const others = prev.pages.filter((p) => p.section_id !== sectionId);
      return { ...prev, pages: [...others, ...next] };
    });
    trackSave(api.reorderPages(next.map((p) => p.id)))
      .then(() => markCourseTouched())
      .catch((e: Error) => setError(e.message));
  }

  function handlePageFieldChange(
    fields: Partial<Pick<Page, "title" | "notes" | "workflow_status">>
  ) {
    if (!selectedPage) return;
    setTree((prev) =>
      prev
        ? {
            ...prev,
            pages: prev.pages.map((p) =>
              p.id === selectedPage.id ? { ...p, ...fields } : p
            ),
          }
        : prev
    );
  }

  function handleSectionFieldChange(
    fields: Partial<
      Pick<Section, "title" | "opens_at" | "assignments_due_at" | "files_folder_url">
    >
  ) {
    if (!selectedSection) return;
    setTree((prev) =>
      prev
        ? {
            ...prev,
            sections: prev.sections.map((s) =>
              s.id === selectedSection.id ? { ...s, ...fields } : s
            ),
          }
        : prev
    );
  }

  function handleSectionPagesWorkflowStatusChange(
    sectionId: string,
    status: PageWorkflowStatus
  ) {
    setTree((prev) =>
      prev
        ? {
            ...prev,
            pages: prev.pages.map((page) =>
              page.section_id === sectionId
                ? { ...page, workflow_status: status }
                : page
            ),
          }
        : prev
    );
  }

  // ─── Sidebar rendering ────────────────────────────────────────────────────

  function rollupLabel(rollup: StatusRollup | undefined, selected = false) {
    if (!rollup || rollup.total_count === 0) return null;
    const complete = rollup.implemented_count === rollup.total_count;
    return (
      <span
        className={`text-xs shrink-0 ${
          selected
            ? "text-white/80"
            : complete
              ? "text-success font-semibold"
              : "text-surface-500"
        }`}
        title={`${rollup.implemented_count} הוטמעו, ${rollup.needs_update_count} עברו שינוי, ${rollup.not_implemented_count} לא הוטמעו`}
      >
        {rollup.implemented_count}/{rollup.total_count}
      </span>
    );
  }

  function renderRenameInput(kind: "section" | "page", id: string, current: string) {
    return (
      <input
        autoFocus
        defaultValue={current}
        className="w-full h-8 px-2 text-base text-surface-900 bg-white border border-surface-200 outline-none"
        onBlur={(e) => handleRename(kind, id, e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") handleRename(kind, id, e.currentTarget.value);
          if (e.key === "Escape") setRenaming(null);
        }}
        onClick={(e) => e.stopPropagation()}
      />
    );
  }

  function renderPageRow(page: Page, handle?: DragHandleProps) {
    const isSelected = selectedPage?.id === page.id;
    const isRenaming = renaming?.kind === "page" && renaming.id === page.id;
    const isHome = isHomePage(page);
    const isUnavailableInImplement =
      mode === "implement" && page.workflow_status === "in_progress";
    const pageNumber = numbering.get(page.id);
    const pageRollup = showRollups ? rollups?.perPage.get(page.id) : undefined;
    const isComplete =
      !!pageRollup &&
      pageRollup.total_count > 0 &&
      pageRollup.implemented_count === pageRollup.total_count;
    const pageType =
      showRollups && !isHome ? (pageTypes.get(page.id) ?? "page") : null;
    const workflowSwatchClass =
      page.workflow_status === "ready_for_implementation"
        ? "bg-emerald-400/40"
        : "bg-amber-400/40";
    const workflowLabel =
      page.workflow_status === "ready_for_implementation"
        ? "מוכן להטמעה"
        : "בעבודה";
    return (
      <div
        className={`group flex items-center gap-1.5 mx-2 ${isHome ? "ps-2" : "ps-5"} pe-2 h-9 rounded-lg text-base transition-colors duration-fast ${
          isSelected
            ? "bg-[#0F6CBF] text-white font-medium"
            : isComplete
              ? "bg-emerald-100 text-emerald-900 hover:bg-emerald-60"
              : "text-surface-600 hover:bg-white hover:text-surface-900"
        } ${
          isUnavailableInImplement
            ? "opacity-40 cursor-not-allowed"
            : "cursor-pointer"
        }`}
        onClick={() => {
          if (!isUnavailableInImplement) selectPage(page.id);
        }}
        aria-disabled={isUnavailableInImplement}
        title={
          isUnavailableInImplement
            ? "העמוד עדיין בעבודה ואינו זמין להטמעה"
            : undefined
        }
      >
        {editable && handle && (
          <button
            {...handle}
            className={`opacity-0 group-hover:opacity-100 p-0.5 cursor-grab active:cursor-grabbing touch-none shrink-0 ${
              isSelected
                ? "text-white/90 hover:text-white"
                : "text-surface-600 hover:text-surface-900"
            }`}
            onClick={(e) => e.stopPropagation()}
          >
            <GripIcon className="w-3.5 h-3.5" />
          </button>
        )}
        {editable && (
          <span
            className={`shrink-0 w-2.5 h-2.5 rounded-sm ${workflowSwatchClass}`}
            title={workflowLabel}
            aria-label={workflowLabel}
          />
        )}
        {pageType && (
          <img
            src={PAGE_TYPE_LOGO[pageType]}
            alt=""
            title={PAGE_TYPE_LABEL[pageType]}
            className={`w-4 h-4 shrink-0 object-contain ${
              isSelected && pageType === "page" ? "brightness-0 invert" : ""
            }`}
          />
        )}
        {pageNumber && (
          <>
            <span className="shrink-0">{pageNumber}</span>
            <span
              className={`shrink-0 ${
                isSelected
                  ? "text-white/70"
                  : isComplete
                    ? "text-emerald-700/50"
                    : "text-surface-400"
              }`}
              aria-hidden
            >
              |
            </span>
          </>
        )}
        {isRenaming ? (
          renderRenameInput("page", page.id, page.title)
        ) : (
          <span className={`truncate flex-1 ${isHome ? "font-semibold" : ""}`}>
            {page.title}
          </span>
        )}
        {showRollups && rollupLabel(pageRollup, isSelected)}
        {editable && !isRenaming && (
          <SidebarRowMenu
            open={openMenu?.kind === "page" && openMenu.id === page.id}
            selectedTone={isSelected}
            ariaLabel="אפשרויות עמוד"
            onToggle={() =>
              setOpenMenu((prev) =>
                prev?.kind === "page" && prev.id === page.id
                  ? null
                  : { kind: "page", id: page.id }
              )
            }
            onClose={() => setOpenMenu(null)}
            items={[
              {
                label: "שנה שם",
                icon: <PencilIcon className="w-3.5 h-3.5 text-surface-500" />,
                onClick: () => setRenaming({ kind: "page", id: page.id }),
              },
              ...(!isHome
                ? [
                    {
                      label: "שכפל עמוד",
                      icon: <DuplicateIcon className="w-4 h-4 text-surface-500" />,
                      onClick: () => handleDuplicatePage(page),
                    },
                    {
                      label: "מחק עמוד",
                      icon: <TrashIcon className="w-3.5 h-3.5" />,
                      danger: true,
                      onClick: () => handleDeletePage(page),
                    },
                  ]
                : []),
            ]}
          />
        )}
      </div>
    );
  }

  function renderSection(section: Section, handle?: DragHandleProps) {
    const pages = pagesBySection.get(section.id) ?? [];
    const isCollapsed = collapsed.has(section.id);
    const isRenaming = renaming?.kind === "section" && renaming.id === section.id;
    const isSelected = selectedSection?.id === section.id;
    const isUnavailableInImplement =
      mode === "implement" && !sectionHasReadyPages(pages);
    const isEffectivelyCollapsed = isCollapsed || isUnavailableInImplement;
    const hasOpenDate = !!section.opens_at?.trim();
    const hasFolderLink = !!section.files_folder_url?.trim();
    const lessonWorkflow = sectionWorkflowStatus(pages);
    const lessonWorkflowSwatchClass =
      lessonWorkflow === "ready_for_implementation"
        ? "bg-emerald-400/40"
        : "bg-amber-400/40";
    const lessonWorkflowLabel =
      lessonWorkflow === "ready_for_implementation"
        ? "מוכן להטמעה"
        : "בעבודה";
    return (
      <div className="flex flex-col">
        <div
          className={`group flex items-center gap-1.5 mx-2 px-2 h-10 rounded-lg text-base font-semibold transition-colors duration-fast ${
            isSelected
              ? "bg-[#0F6CBF] text-white"
              : "text-surface-900 hover:bg-white"
          } ${
            isUnavailableInImplement
              ? "opacity-40 cursor-not-allowed"
              : ""
          }`}
          aria-disabled={isUnavailableInImplement}
          title={
            isUnavailableInImplement
              ? "השיעור עדיין בעבודה ואינו זמין להטמעה"
              : undefined
          }
        >
          {editable && handle && (
            <button
              {...handle}
              className={`opacity-0 group-hover:opacity-100 p-0.5 cursor-grab active:cursor-grabbing touch-none shrink-0 ${
                isSelected
                  ? "text-white/90 hover:text-white"
                  : "text-surface-600 hover:text-surface-900"
              }`}
            >
              <GripIcon className="w-3.5 h-3.5" />
            </button>
          )}
          {editable && (
            <span
              className={`shrink-0 w-2.5 h-2.5 rounded-sm ${lessonWorkflowSwatchClass}`}
              title={lessonWorkflowLabel}
              aria-label={lessonWorkflowLabel}
            />
          )}
          <button
            type="button"
            className={`p-0.5 shrink-0 ${
              isSelected
                ? "text-white/90 hover:text-white"
                : isUnavailableInImplement
                  ? "text-surface-500 cursor-not-allowed"
                  : "text-surface-500 hover:text-surface-900"
            }`}
            disabled={isUnavailableInImplement}
            aria-expanded={!isEffectivelyCollapsed}
            aria-label={isEffectivelyCollapsed ? "הרחב שיעור" : "כווץ שיעור"}
            onClick={() => {
              if (isUnavailableInImplement) return;
              setCollapsed((prev) => {
                const next = new Set(prev);
                if (next.has(section.id)) next.delete(section.id);
                else next.add(section.id);
                return next;
              });
            }}
          >
            <ChevronDownIcon
              className={`w-3.5 h-3.5 transition-transform duration-fast ${isEffectivelyCollapsed ? "rotate-90" : ""}`}
            />
          </button>
          {isRenaming ? (
            renderRenameInput("section", section.id, section.title)
          ) : (
            <button
              type="button"
              className={`truncate flex-1 min-w-0 text-start ${
                isUnavailableInImplement ? "cursor-not-allowed" : ""
              }`}
              disabled={isUnavailableInImplement}
              onClick={() => {
                if (!isUnavailableInImplement) selectSection(section.id);
              }}
            >
              {section.title}
            </button>
          )}
          {(hasOpenDate || hasFolderLink) && (
            <span
              className={`flex items-center gap-1 shrink-0 ${
                isSelected ? "text-white/85" : "text-surface-500"
              }`}
            >
              {hasOpenDate && (
                <span title="יש תאריך פתיחה" aria-label="יש תאריך פתיחה">
                  <CalendarIcon className="w-3.5 h-3.5" />
                </span>
              )}
              {hasFolderLink && (
                <span title="יש תיקיית קבצים" aria-label="יש תיקיית קבצים">
                  <FolderIcon className="w-3.5 h-3.5" />
                </span>
              )}
            </span>
          )}
          {showRollups && rollupLabel(rollups?.perSection.get(section.id), isSelected)}
          {editable && !isRenaming && (
            <SidebarRowMenu
              open={openMenu?.kind === "section" && openMenu.id === section.id}
              selectedTone={isSelected}
              ariaLabel="אפשרויות שיעור"
              onToggle={() =>
                setOpenMenu((prev) =>
                  prev?.kind === "section" && prev.id === section.id
                    ? null
                    : { kind: "section", id: section.id }
                )
              }
              onClose={() => setOpenMenu(null)}
              items={[
                {
                  label: "שנה שם",
                  icon: <PencilIcon className="w-3.5 h-3.5 text-surface-500" />,
                  onClick: () => setRenaming({ kind: "section", id: section.id }),
                },
                {
                  label: "שכפל שיעור",
                  icon: <DuplicateIcon className="w-4 h-4 text-surface-500" />,
                  onClick: () => handleDuplicateSection(section),
                },
                {
                  label: "מחק שיעור",
                  icon: <TrashIcon className="w-3.5 h-3.5" />,
                  danger: true,
                  onClick: () => handleDeleteSection(section),
                },
              ]}
            />
          )}
        </div>

        {!isEffectivelyCollapsed && (
          <div className="flex flex-col">
            {editable ? (
              <SortableList
                items={pages}
                onReorder={(next) => handleReorderPages(section.id, next)}
                renderItem={(page, pageHandle) => renderPageRow(page, pageHandle)}
              />
            ) : (
              pages.map((page) => <div key={page.id}>{renderPageRow(page)}</div>)
            )}
            {editable && (
              <button
                className="flex items-center gap-1.5 mx-2 ps-5 pe-2 h-8 text-sm text-surface-400 hover:text-surface-900 transition-colors duration-fast"
                onClick={() => handleAddPage(section.id)}
              >
                {/* Match page-row grip slot so + aligns with page numbers */}
                <span className="w-4 shrink-0" aria-hidden />
                <PlusIcon className="w-3 h-3" />
                עמוד חדש
              </button>
            )}
          </div>
        )}
      </div>
    );
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <PageLayout
      toolName="Course Builder"
      toolNameHe="פיתוח קורסים"
      toolTrail={[
        { label: "כל הקורסים", to: "/" },
        { label: tree?.course.title?.trim() || "..." },
      ]}
      renderTrailLink={({ to, className, children }) => (
        <Link to={to} className={className}>
          {children}
        </Link>
      )}
      maxWidth="full"
      padded={false}
    >
      <div dir="rtl" lang="he" className="flex h-[calc(100vh-3rem)] min-h-0 overflow-hidden">
        {/* Sidebar — fixed pane; own scrollbar when nav overflows */}
        <aside className="w-80 shrink-0 bg-[#F8F9FA] flex flex-col min-h-0 overflow-hidden">
          <div className="p-4 border-b border-surface-200 flex flex-col gap-2">
            {/* Title (right) + mode toggle (top-left in RTL) */}
            <div className="flex items-start justify-between gap-2">
              <span className="text-xl font-semibold text-surface-900 leading-snug min-w-0 flex-1">
                {tree?.course.title ?? "..."}
              </span>
              <div className="flex border border-surface-200 rounded-control overflow-hidden shrink-0 text-xs font-semibold">
                {(
                  [
                    { path: "edit", label: "עריכה", value: "edit" as const },
                    { path: "implement", label: "הטמעה", value: "implement" as const },
                    { path: "review", label: "תצוגה", value: "review" as const },
                  ] as const
                ).map((seg, i) => (
                  <Link
                    key={seg.value}
                    to={`/courses/${courseId}/${seg.path}${
                      selectedSection
                        ? `?section=${selectedSection.id}`
                        : selectedPage
                          ? `?page=${selectedPage.id}`
                          : ""
                    }`}
                    className={`px-2.5 py-1 transition-colors duration-fast ${
                      i > 0 ? "border-s border-surface-200" : ""
                    } ${
                      mode === seg.value
                        ? "bg-black text-white"
                        : "bg-white text-surface-600"
                    }`}
                  >
                    {seg.label}
                  </Link>
                ))}
              </div>
            </div>
            {tree?.course.updated_at && (
              <span className="block w-full text-sm text-surface-500">
                עודכן לאחרונה ב{formatDate(tree.course.updated_at)}
              </span>
            )}
          </div>

          <nav className="scrollbar-rounded flex-1 overflow-y-auto py-2">
            {tree === null && !error && (
              <div className="flex items-center gap-2 px-4 py-2 text-base text-surface-600">
                <Spinner size="sm" />
                טוען...
              </div>
            )}
            {tree !== null && homePage && (
              <div className="mb-1">{renderPageRow(homePage)}</div>
            )}
            {tree !== null && tree.sections.length === 0 && (
              <p className="px-4 py-2 text-base text-surface-400">
                {editable ? "אין עדיין שיעורים בקורס." : "אין שיעורים בקורס."}
              </p>
            )}
            {tree !== null &&
              (editable ? (
                <SortableList
                  items={tree.sections}
                  onReorder={handleReorderSections}
                  renderItem={(section, handle) => renderSection(section, handle)}
                />
              ) : (
                tree.sections.map((section) => (
                  <div key={section.id}>{renderSection(section)}</div>
                ))
              ))}
            {editable && tree !== null && (
              <button
                className="flex items-center gap-1.5 px-2 h-10 mt-1 text-base font-semibold text-surface-500 hover:text-surface-900 transition-colors duration-fast w-full"
                onClick={handleAddSection}
              >
                {/* Match section-row grip slot (chevron not reserved — sits slightly right of titles) */}
                <span className="w-4 shrink-0" aria-hidden />
                <PlusIcon className="w-3.5 h-3.5" />
                שיעור חדש
              </button>
            )}
          </nav>
        </aside>

        {/* Main content */}
        <div className="flex-1 min-w-0 overflow-y-auto bg-white">
          <div className="fixed top-14 left-4 z-20 pointer-events-none">
            <SaveStatusIndicator />
          </div>
          {error && (
            <div className="max-w-3xl mx-auto px-6 py-6">
              <Card className="border-danger bg-red-50">
                <p className="text-sm text-danger">{error}</p>
              </Card>
            </div>
          )}
          {!error &&
            tree !== null &&
            selectedSection === null &&
            selectedPage === null && (
            <div className="max-w-3xl mx-auto px-6 py-10 text-center">
              <p className="text-sm text-surface-500">
                {blockedRequestedSection
                  ? `השיעור "${blockedRequestedSection.title}" עדיין בעבודה ואינו זמין בתצוגת ההטמעה.`
                  : blockedRequestedPage
                    ? `העמוד "${blockedRequestedPage.title}" עדיין בעבודה ואינו זמין בתצוגת ההטמעה.`
                    : editable
                      ? "צרו שיעור כדי להתחיל לבנות את הקורס."
                      : mode === "implement"
                        ? "אין עדיין עמודים שמוכנים להטמעה."
                        : "אין עמודים בקורס הזה."}
              </p>
            </div>
          )}
          {!error && selectedSection !== null && (
            <SectionOverview
              key={selectedSection.id}
              section={selectedSection}
              mode={mode}
              pages={pagesBySection.get(selectedSection.id) ?? []}
              pageTypes={pageTypes}
              numbering={numbering}
              onSelectPage={selectPage}
              onSectionChange={handleSectionFieldChange}
              onPagesWorkflowStatusChange={(status) =>
                handleSectionPagesWorkflowStatusChange(
                  selectedSection.id,
                  status
                )
              }
              onContentChange={markCourseTouched}
            />
          )}
          {!error && selectedPage !== null && (
            <PageContent
              key={selectedPage.id}
              page={selectedPage}
              numbering={numbering.get(selectedPage.id) ?? ""}
              mode={mode}
              rollup={showRollups ? rollups?.perPage.get(selectedPage.id) : undefined}
              prevPage={
                adjacentPages.prev
                  ? {
                      id: adjacentPages.prev.id,
                      title: adjacentPages.prev.title,
                      numbering: numbering.get(adjacentPages.prev.id) ?? "",
                    }
                  : null
              }
              nextPage={
                adjacentPages.next
                  ? {
                      id: adjacentPages.next.id,
                      title: adjacentPages.next.title,
                      numbering: numbering.get(adjacentPages.next.id) ?? "",
                    }
                  : null
              }
              onNavigatePage={selectPage}
              onPageChange={handlePageFieldChange}
              onStatusChange={() => {
                refreshRollups();
                refreshPageTypes();
              }}
              onContentChange={() => {
                markCourseTouched();
                refreshPageTypes();
              }}
            />
          )}
        </div>
      </div>
    </PageLayout>
  );
}
