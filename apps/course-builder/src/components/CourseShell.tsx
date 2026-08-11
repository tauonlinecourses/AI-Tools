import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { PageLayout, Card, Spinner } from "@workspace/ui";
import type { CourseViewMode, Page, Section, CourseTree, StatusRollup } from "../lib/types";
import { isHomePage } from "../lib/types";
import * as api from "../lib/api";
import { PageContent } from "./PageContent";
import { SortableList, type DragHandleProps } from "./SortableList";
import { ChevronDownIcon, GripIcon, PencilIcon, PlusIcon, TrashIcon } from "./icons";
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
  const [rollups, setRollups] = useState<{
    perPage: Map<string, StatusRollup>;
    perSection: Map<string, StatusRollup>;
  } | null>(null);

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

  useEffect(() => {
    refreshRollups();
  }, [refreshRollups]);

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

  const selectedPage = useMemo(() => {
    if (!tree) return null;
    const requested = searchParams.get("page");
    if (requested) {
      const found = tree.pages.find((p) => p.id === requested);
      if (found) return found;
    }
    if (homePage) return homePage;
    for (const section of tree.sections) {
      const pages = pagesBySection.get(section.id) ?? [];
      if (pages.length > 0) return pages[0];
    }
    return null;
  }, [tree, pagesBySection, searchParams, homePage]);

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

  function selectPage(pageId: string) {
    setSearchParams({ page: pageId }, { replace: true });
  }

  // ─── Section mutations ────────────────────────────────────────────────────

  async function handleAddSection() {
    if (!tree || !courseId) return;
    try {
      const section = await trackSave(
        api.addSection(courseId, "שיעור חדש", tree.sections.length)
      );
      setTree((prev) => (prev ? { ...prev, sections: [...prev.sections, section] } : prev));
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
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  function handleReorderSections(next: Section[]) {
    setTree((prev) => (prev ? { ...prev, sections: next } : prev));
    trackSave(api.reorderSections(next.map((s) => s.id))).catch((e: Error) =>
      setError(e.message)
    );
  }

  // ─── Page mutations ───────────────────────────────────────────────────────

  async function handleAddPage(sectionId: string) {
    const siblings = pagesBySection.get(sectionId) ?? [];
    try {
      const page = await trackSave(api.addPage(sectionId, "עמוד חדש", siblings.length));
      setTree((prev) => (prev ? { ...prev, pages: [...prev.pages, page] } : prev));
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
      if (searchParams.get("page") === page.id) setSearchParams({}, { replace: true });
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
    trackSave(api.reorderPages(next.map((p) => p.id))).catch((e: Error) => setError(e.message));
  }

  function handlePageFieldChange(fields: Partial<Pick<Page, "title" | "notes">>) {
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
    const pageNumber = numbering.get(page.id);
    const pageRollup = showRollups ? rollups?.perPage.get(page.id) : undefined;
    const isComplete =
      !!pageRollup &&
      pageRollup.total_count > 0 &&
      pageRollup.implemented_count === pageRollup.total_count;
    return (
      <div
        className={`group flex items-center gap-1.5 mx-2 ${isHome ? "ps-2" : "ps-5"} pe-2 h-9 rounded-lg cursor-pointer text-base transition-colors duration-fast ${
          isSelected
            ? "bg-[#0F6CBF] text-white font-medium"
            : isComplete
              ? "bg-emerald-100 text-emerald-900 hover:bg-emerald-60"
              : "text-surface-600 hover:bg-white hover:text-surface-900"
        }`}
        onClick={() => selectPage(page.id)}
      >
        {editable && handle && (
          <button
            {...handle}
            className={`opacity-0 group-hover:opacity-100 p-0.5 cursor-grab active:cursor-grabbing touch-none shrink-0 ${
              isSelected
                ? "text-white/70 hover:text-white"
                : "text-surface-400 hover:text-surface-900"
            }`}
            onClick={(e) => e.stopPropagation()}
          >
            <GripIcon className="w-3 h-3" />
          </button>
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
          <span className="ms-auto hidden group-hover:flex items-center shrink-0">
            <button
              className={`p-1 ${
                isSelected
                  ? "text-white/70 hover:text-white"
                  : "text-surface-400 hover:text-surface-900"
              }`}
              title="שנה שם"
              onClick={(e) => {
                e.stopPropagation();
                setRenaming({ kind: "page", id: page.id });
              }}
            >
              <PencilIcon className="w-3 h-3" />
            </button>
            {!isHome && (
              <button
                className={`p-1 ${
                  isSelected
                    ? "text-white/70 hover:text-white"
                    : "text-surface-400 hover:text-danger"
                }`}
                title="מחק עמוד"
                onClick={(e) => {
                  e.stopPropagation();
                  handleDeletePage(page);
                }}
              >
                <TrashIcon className="w-3 h-3" />
              </button>
            )}
          </span>
        )}
      </div>
    );
  }

  function renderSection(section: Section, handle?: DragHandleProps) {
    const pages = pagesBySection.get(section.id) ?? [];
    const isCollapsed = collapsed.has(section.id);
    const isRenaming = renaming?.kind === "section" && renaming.id === section.id;
    return (
      <div className="flex flex-col">
        <div className="group flex items-center gap-1.5 px-2 h-10 text-base font-semibold text-surface-900 hover:bg-white transition-colors duration-fast">
          {editable && handle && (
            <button
              {...handle}
              className="opacity-0 group-hover:opacity-100 p-0.5 text-surface-400 hover:text-surface-900 cursor-grab active:cursor-grabbing touch-none shrink-0"
            >
              <GripIcon className="w-3 h-3" />
            </button>
          )}
          <button
            className="p-0.5 text-surface-500 hover:text-surface-900 shrink-0"
            onClick={() =>
              setCollapsed((prev) => {
                const next = new Set(prev);
                if (next.has(section.id)) next.delete(section.id);
                else next.add(section.id);
                return next;
              })
            }
          >
            <ChevronDownIcon
              className={`w-3.5 h-3.5 transition-transform duration-fast ${isCollapsed ? "rotate-90" : ""}`}
            />
          </button>
          {isRenaming ? (
            renderRenameInput("section", section.id, section.title)
          ) : (
            <span className="truncate flex-1">{section.title}</span>
          )}
          {showRollups && rollupLabel(rollups?.perSection.get(section.id))}
          {editable && !isRenaming && (
            <span className="ms-auto hidden group-hover:flex items-center shrink-0">
              <button
                className="p-1 text-surface-400 hover:text-surface-900"
                title="שנה שם"
                onClick={() => setRenaming({ kind: "section", id: section.id })}
              >
                <PencilIcon className="w-3 h-3" />
              </button>
              <button
                className="p-1 text-surface-400 hover:text-danger"
                title="מחק שיעור"
                onClick={() => handleDeleteSection(section)}
              >
                <TrashIcon className="w-3 h-3" />
              </button>
            </span>
          )}
        </div>

        {!isCollapsed && (
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
                הוסף עמוד
              </button>
            )}
          </div>
        )}
      </div>
    );
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <PageLayout toolName="Course Builder" maxWidth="full" padded={false}>
      <div dir="rtl" lang="he" className="flex h-[calc(100vh-3rem)] min-h-0 overflow-hidden">
        {/* Sidebar — fixed pane; own scrollbar when nav overflows */}
        <aside className="w-80 shrink-0 bg-[#F8F9FA] flex flex-col min-h-0 overflow-hidden">
          <div className="p-4 border-b border-surface-200 flex flex-col gap-2">
            {/* Title + last updated (right) + mode toggle (top-left in RTL) */}
            <div className="flex items-start justify-between gap-2">
              <div className="flex flex-col gap-1 min-w-0 flex-1">
                <span className="text-xl font-semibold text-surface-900 leading-snug">
                  {tree?.course.title ?? "..."}
                </span>
                {tree?.course.updated_at && (
                  <span className="text-sm text-surface-500">
                    עודכן ב{formatDate(tree.course.updated_at)}
                  </span>
                )}
              </div>
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
                      selectedPage ? `?page=${selectedPage.id}` : ""
                    }`}
                    className={`px-2.5 py-1 transition-colors duration-fast ${
                      i > 0 ? "border-s border-surface-200" : ""
                    } ${
                      mode === seg.value
                        ? "bg-black text-white"
                        : "text-surface-600 hover:bg-white"
                    }`}
                  >
                    {seg.label}
                  </Link>
                ))}
              </div>
            </div>
            <Link
              to="/"
              className="text-sm text-surface-500 hover:text-surface-900 transition-colors duration-fast self-start"
            >
              חזרה לכל הקורסים
            </Link>
          </div>

          <nav className="flex-1 overflow-y-auto py-2">
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
                הוסף שיעור
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
          {!error && tree !== null && selectedPage === null && (
            <div className="max-w-3xl mx-auto px-6 py-10 text-center">
              <p className="text-sm text-surface-500">
                {editable
                  ? "צרו שיעור כדי להתחיל לבנות את הקורס."
                  : "אין עמודים בקורס הזה."}
              </p>
            </div>
          )}
          {!error && selectedPage !== null && (
            <PageContent
              key={selectedPage.id}
              page={selectedPage}
              numbering={numbering.get(selectedPage.id) ?? ""}
              mode={mode}
              rollup={showRollups ? rollups?.perPage.get(selectedPage.id) : undefined}
              onPageChange={handlePageFieldChange}
              onStatusChange={refreshRollups}
            />
          )}
        </div>
      </div>
    </PageLayout>
  );
}
