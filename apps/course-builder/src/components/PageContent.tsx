import { useEffect, useRef, useState } from "react";
import { Button, Card, Spinner } from "@workspace/ui";
import type {
  BlockProps,
  ComponentComment,
  ComponentType,
  CourseViewMode,
  ImplementationStatus,
  Page,
  PageComponent,
  StatusRollup,
} from "../lib/types";
import { componentStatus } from "../lib/types";
import * as api from "../lib/api";
import { writeClipboard } from "../lib/clipboard";
import { useSaveStatus } from "../lib/saveStatus";
import { htmlToPlainText, resolveTextHtml, sanitizeTextHtml } from "../lib/textHtml";
import { SortableList } from "./SortableList";
import { BlockComments } from "./BlockComments";
import { PageNotes } from "./PageNotes";
import { BlockRenderer } from "./blocks/BlockRenderer";
import { NotesDisplay, TextField } from "./blocks/fields";
import { detectVideoProvider } from "../lib/videoEmbed";
import {
  PageWorkflowStatusToggle,
  StatusBadge,
  nextStatus,
  statusBorderClass,
  statusHeaderClass,
} from "./StatusBadge";
import {
  BannerIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CopyIcon,
  DuplicateIcon,
  GripIcon,
  LinkIcon,
  PencilIcon,
  PlusIcon,
  QuestionIcon,
  TextIcon,
  TrashIcon,
  VideoIcon,
} from "./icons";

/** Sentinel for the open page-notes panel (mutually exclusive with block threads). */
const PAGE_NOTES_OPEN_ID = "__page_notes__";

type ClipboardPayload = { html?: string; plain: string };
type HeaderField = "banner-url" | "video-title" | "video-url";

function HeaderFieldPopover({
  open,
  label,
  title,
  icon,
  onToggle,
  onClose,
  children,
}: {
  open: boolean;
  label: string;
  title: string;
  icon: React.ReactNode;
  onToggle: () => void;
  onClose: () => void;
  children: React.ReactNode;
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
    <div ref={rootRef} className="relative">
      <button
        type="button"
        className={`p-1.5 transition-colors duration-fast ${
          open
            ? "bg-surface-900 text-white"
            : "text-surface-500 hover:bg-surface-200 hover:text-surface-900"
        }`}
        title={title}
        aria-label={title}
        aria-expanded={open}
        onClick={(event) => {
          event.stopPropagation();
          onToggle();
        }}
      >
        {icon}
      </button>
      {open && (
        <div
          className="absolute top-full start-0 z-50 mt-2 w-72 border border-surface-200 bg-white p-3 shadow-lg"
          role="dialog"
          aria-label={label}
          onClick={(event) => event.stopPropagation()}
        >
          <span className="mb-1.5 block text-sm font-semibold text-surface-700">
            {label}
          </span>
          {children}
        </div>
      )}
    </div>
  );
}

/** Clipboard payload for the implement-mode header copy button (by block type). */
function headerCopyPayload(component: PageComponent): ClipboardPayload {
  switch (component.type) {
    case "text": {
      const html = sanitizeTextHtml(resolveTextHtml(component.props));
      return { html, plain: htmlToPlainText(html) };
    }
    case "banner":
      return { plain: component.props.imageUrl ?? "" };
    case "video":
      return { plain: component.props.url ?? "" };
    case "question":
      return { plain: component.props.prompt ?? "" };
  }
}

const SAVE_DEBOUNCE_MS = 700;

const typeMeta: Record<ComponentType, { label: string; icon: React.ReactNode }> = {
  banner: { label: "באנר", icon: <BannerIcon /> },
  video: { label: "וידאו", icon: <VideoIcon /> },
  text: { label: "טקסט", icon: <TextIcon /> },
  question: { label: "שאלה", icon: <QuestionIcon /> },
};

function defaultProps(type: ComponentType): BlockProps {
  switch (type) {
    case "banner":
      return { title: "" };
    case "video":
      return { url: "" };
    case "text":
      return { html: "" };
    case "question":
      return {
        questionType: "single_choice",
        prompt: "",
        options: [
          { id: crypto.randomUUID(), text: "" },
          { id: crypto.randomUUID(), text: "" },
        ],
      };
  }
}

interface AdjacentPageLink {
  id: string;
  title: string;
  numbering: string;
}

interface PageContentProps {
  page: Page;
  numbering: string;
  mode: CourseViewMode;
  rollup?: StatusRollup;
  prevPage: AdjacentPageLink | null;
  nextPage: AdjacentPageLink | null;
  onNavigatePage: (pageId: string) => void;
  /** Notify the shell that page metadata changed (to refresh the sidebar). */
  onPageChange: (
    fields: Partial<Pick<Page, "title" | "notes" | "workflow_status">>
  ) => void;
  /** Notify the shell that implementation status may have changed (implement rollups). */
  onStatusChange: () => void;
  /** Notify the shell that nested content was saved (refresh course last-updated). */
  onContentChange: () => void;
}

export function PageContent({
  page,
  numbering,
  mode,
  rollup,
  prevPage,
  nextPage,
  onNavigatePage,
  onPageChange,
  onStatusChange,
  onContentChange,
}: PageContentProps) {
  const { trackSave, beginSave, endSave } = useSaveStatus();
  const editable = mode === "edit";
  const isImplement = mode === "implement";
  const isReview = mode === "review";

  const [components, setComponents] = useState<PageComponent[] | null>(null);
  const [commentsByComponent, setCommentsByComponent] = useState<
    Map<string, ComponentComment[]>
  >(new Map());
  /** At most one open comment thread at a time. */
  const [openCommentId, setOpenCommentId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** At most one field popover in a block header is open. */
  const [openHeaderField, setOpenHeaderField] = useState<string | null>(null);

  // Debounced persistence for block props and page fields.
  const timers = useRef(new Map<string, number>());
  const pendingProps = useRef(new Map<string, BlockProps>());

  // The shell re-creates these callbacks on every render (including the ones
  // caused by the save indicator), so they must stay out of the load effect's
  // deps — otherwise any save would refetch the page and close open panels.
  const flushDeps = useRef({ trackSave, endSave, onContentChange });
  flushDeps.current = { trackSave, endSave, onContentChange };

  useEffect(() => {
    setComponents(null);
    setCommentsByComponent(new Map());
    setOpenCommentId(null);
    setError(null);
    setOpenHeaderField(null);
    api
      .listComponents(page.id)
      .then(setComponents)
      .catch((e: Error) => setError(e.message));
    api
      .listCommentsForPage(page.id)
      .then((rows) => {
        const map = new Map<string, ComponentComment[]>();
        for (const row of rows) {
          const list = map.get(row.component_id) ?? [];
          list.push(row);
          map.set(row.component_id, list);
        }
        setCommentsByComponent(map);
      })
      .catch((e: Error) => setError(e.message));

    const timersMap = timers.current;
    const pendingMap = pendingProps.current;
    return () => {
      const flush = flushDeps.current;
      // Flush unsaved block edits when leaving the page.
      for (const [key, t] of timersMap) {
        window.clearTimeout(t);
        flush.endSave(key);
      }
      timersMap.clear();
      for (const [id, props] of pendingMap) {
        flush
          .trackSave(
            api.updateComponentProps(id, props).then(() => {
              flush.onContentChange();
            })
          )
          .catch(() => undefined);
      }
      pendingMap.clear();
    };
  }, [page.id]);

  function scheduleSave(key: string, save: () => Promise<void>) {
    beginSave(key);
    const existing = timers.current.get(key);
    if (existing) window.clearTimeout(existing);
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

  function handlePropsChange(id: string, props: BlockProps) {
    setComponents((prev) =>
      prev ? prev.map((c) => (c.id === id ? { ...c, props } : c)) : prev
    );
    pendingProps.current.set(id, props);
    scheduleSave(`component:${id}`, async () => {
      pendingProps.current.delete(id);
      const updated = await api.updateComponentProps(id, props);
      setComponents((prev) =>
        prev
          ? prev.map((c) => (c.id === id ? { ...c, updated_at: updated.updated_at } : c))
          : prev
      );
      onContentChange();
      onStatusChange();
    });
  }

  function handleTitleChange(title: string) {
    onPageChange({ title });
    scheduleSave(`page-title:${page.id}`, async () => {
      await api.updatePage(page.id, { title });
      onContentChange();
    });
  }

  function handleNotesChange(notes: string) {
    onPageChange({ notes });
    scheduleSave(`page-notes:${page.id}`, async () => {
      await api.updatePage(page.id, { notes });
      onContentChange();
    });
  }

  async function handleToggleWorkflowStatus() {
    const previous = page.workflow_status;
    const workflow_status =
      previous === "in_progress" ? "ready_for_implementation" : "in_progress";
    onPageChange({ workflow_status });
    setError(null);
    try {
      await trackSave(api.updatePage(page.id, { workflow_status }));
      onContentChange();
    } catch (e) {
      onPageChange({ workflow_status: previous });
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  function toggleHeaderField(componentId: string, field: HeaderField) {
    const key = `${componentId}:${field}`;
    setOpenHeaderField((current) => (current === key ? null : key));
  }

  /** 1-based ordinal of each video among video components on this page (current order). */
  const videoNumberById = (() => {
    const map = new Map<string, number>();
    if (!components) return map;
    let n = 0;
    for (const c of components) {
      if (c.type === "video") map.set(c.id, ++n);
    }
    return map;
  })();

  async function handleAdd(type: ComponentType) {
    setError(null);
    try {
      const created = await trackSave(
        api.addComponent(page.id, type, components?.length ?? 0, defaultProps(type))
      );
      setComponents((prev) => [...(prev ?? []), created]);
      onContentChange();
      onStatusChange();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function handleDelete(id: string) {
    if (!window.confirm("למחוק את הרכיב?")) return;
    setError(null);
    try {
      await trackSave(api.deleteComponent(id));
      setComponents((prev) => prev?.filter((c) => c.id !== id) ?? prev);
      setCommentsByComponent((prev) => {
        const next = new Map(prev);
        next.delete(id);
        return next;
      });
      if (openCommentId === id) setOpenCommentId(null);
      onContentChange();
      onStatusChange();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function handleDuplicate(component: PageComponent) {
    setError(null);
    try {
      const created = await trackSave(api.duplicateComponent(component.id));
      setComponents((prev) => {
        if (!prev) return [created];
        const idx = prev.findIndex((c) => c.id === component.id);
        if (idx < 0) return [...prev, created];
        const next = [
          ...prev.slice(0, idx + 1),
          created,
          ...prev.slice(idx + 1),
        ].map((c, position) => ({ ...c, position }));
        return next;
      });
      onContentChange();
      onStatusChange();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function handleAddComment(componentId: string, body: string) {
    setError(null);
    try {
      const created = await trackSave(api.addComment(componentId, mode, body));
      setCommentsByComponent((prev) => {
        const next = new Map(prev);
        const list = [...(next.get(componentId) ?? []), created];
        next.set(componentId, list);
        return next;
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      throw e;
    }
  }

  async function handleSetCommentResolved(commentId: string, resolved: boolean) {
    setError(null);
    try {
      const updated = await trackSave(api.setCommentResolved(commentId, resolved));
      setCommentsByComponent((prev) => {
        const next = new Map(prev);
        const list = next.get(updated.component_id);
        if (!list) return prev;
        next.set(
          updated.component_id,
          list.map((c) => (c.id === updated.id ? updated : c))
        );
        return next;
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      throw e;
    }
  }

  async function handleDeleteComment(componentId: string, commentId: string) {
    setError(null);
    try {
      await trackSave(api.deleteComment(commentId));
      setCommentsByComponent((prev) => {
        const next = new Map(prev);
        const list = next.get(componentId);
        if (!list) return prev;
        next.set(
          componentId,
          list.filter((c) => c.id !== commentId)
        );
        return next;
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      throw e;
    }
  }

  function wrapWithComments(componentId: string, block: React.ReactNode) {
    return (
      <BlockComments
        componentId={componentId}
        comments={commentsByComponent.get(componentId) ?? []}
        mode={mode}
        open={openCommentId === componentId}
        onToggle={() =>
          setOpenCommentId((prev) => (prev === componentId ? null : componentId))
        }
        onAdd={(body) => handleAddComment(componentId, body)}
        onSetResolved={handleSetCommentResolved}
        onDelete={(commentId) => handleDeleteComment(componentId, commentId)}
      >
        {block}
      </BlockComments>
    );
  }

  function handleReorder(next: PageComponent[]) {
    setComponents(next);
    trackSave(api.reorderComponents(next.map((c) => c.id)))
      .then(() => {
        onContentChange();
        onStatusChange();
      })
      .catch((e: Error) => setError(e.message));
  }

  async function handleCopyAndMark(id: string, payload: string | ClipboardPayload) {
    setError(null);
    try {
      const clip = typeof payload === "string" ? { plain: payload } : payload;
      await writeClipboard(clip);

      const current = components?.find((c) => c.id === id);
      // Already הוטמע — clipboard only; skip DB write / save spinner.
      if (current && componentStatus(current) === "implemented") return;

      const updated = await trackSave(api.markImplemented(id));
      setComponents((prev) =>
        prev ? prev.map((c) => (c.id === id ? updated : c)) : prev
      );
      onStatusChange();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function handleCycleStatus(component: PageComponent) {
    setError(null);
    try {
      const updated = await trackSave(
        api.setComponentStatus(component.id, nextStatus(componentStatus(component)))
      );
      setComponents((prev) =>
        prev ? prev.map((c) => (c.id === component.id ? updated : c)) : prev
      );
      onStatusChange();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  /** Aggregate page status: unanimous if all match; else least progressed. */
  function pageAggregateStatus(list: PageComponent[]): ImplementationStatus {
    if (list.length === 0) return "not_implemented";
    const statuses = list.map(componentStatus);
    if (statuses.every((s) => s === statuses[0])) return statuses[0];
    if (statuses.includes("not_implemented")) return "not_implemented";
    if (statuses.includes("needs_update")) return "needs_update";
    return "implemented";
  }

  async function handleCyclePageStatus() {
    if (!components || components.length === 0) return;
    const target = nextStatus(pageAggregateStatus(components));
    setError(null);
    try {
      const updated = await trackSave(
        Promise.all(
          components.map((c) => api.setComponentStatus(c.id, target))
        )
      );
      setComponents(updated);
      onStatusChange();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  function renderBlock(component: PageComponent) {
    return (
      <BlockRenderer
        type={component.type}
        props={component.props}
        mode={mode}
        onChange={(props) => handlePropsChange(component.id, props)}
        pageTitle={page.title}
        pageNumbering={numbering}
        videoNumber={videoNumberById.get(component.id)}
        onCopyOption={
          isImplement && component.type === "question"
            ? (text) => handleCopyAndMark(component.id, text)
            : undefined
        }
      />
    );
  }

  /** Polished preview: stacked blocks with comment gutter (no type header). */
  function renderPreviewBlock(component: PageComponent) {
    return wrapWithComments(component.id, renderBlock(component));
  }

  function renderComponentCard(
    component: PageComponent,
    handle?: React.HTMLAttributes<HTMLElement> & { ref: (el: HTMLElement | null) => void }
  ) {
    const meta = typeMeta[component.type];
    const status = componentStatus(component);
    const isVideo = component.type === "video";
    const isBanner = component.type === "banner";
    const flushBody = isVideo || isBanner;
    const fieldIsOpen = (field: HeaderField) =>
      openHeaderField === `${component.id}:${field}`;
    const closeHeaderField = () => setOpenHeaderField(null);

    return wrapWithComments(
      component.id,
      <Card
        padding="none"
        border={false}
        className={`border-2 transition-colors duration-fast ${
          isImplement ? statusBorderClass(status) : "border-surface-200"
        }`}
      >
        <div
          className={`flex items-center gap-2 px-3 h-10 border-b-2 transition-colors duration-fast ${
            editable
              ? "border-surface-200 bg-[#F8F9FA]"
              : statusHeaderClass(status)
          }`}
        >
          {editable && handle && (
            <button
              {...handle}
              className="p-1 text-surface-400 hover:text-surface-900 cursor-grab active:cursor-grabbing touch-none"
              title="גרירה לשינוי סדר"
              onClick={(e) => e.stopPropagation()}
            >
              <GripIcon />
            </button>
          )}
          <span
            className={`flex items-center gap-1.5 text-sm font-semibold ${
              editable ? "text-surface-700" : "text-inherit"
            }`}
          >
            {meta.icon}
            {meta.label}
          </span>
          {editable && (isBanner || isVideo) && (
            <span className="text-surface-300 select-none" aria-hidden>
              |
            </span>
          )}
          {editable && isBanner && (
            <HeaderFieldPopover
              open={fieldIsOpen("banner-url")}
              label="קישור לתמונה"
              title="עריכת קישור לתמונה"
              icon={<LinkIcon className="w-4 h-4" />}
              onToggle={() => toggleHeaderField(component.id, "banner-url")}
              onClose={closeHeaderField}
            >
              <TextField
                dir="ltr"
                autoFocus
                value={component.props.imageUrl ?? ""}
                placeholder="https://..."
                onChange={(event) =>
                  handlePropsChange(component.id, {
                    ...component.props,
                    imageUrl: event.target.value,
                  })
                }
              />
            </HeaderFieldPopover>
          )}
          {editable && isVideo && (
            <div className="flex items-center gap-1">
              <HeaderFieldPopover
                open={fieldIsOpen("video-title")}
                label="שם הסרטון"
                title="עריכת שם הסרטון"
                icon={<PencilIcon className="w-4 h-4" />}
                onToggle={() => toggleHeaderField(component.id, "video-title")}
                onClose={closeHeaderField}
              >
                <TextField
                  autoFocus
                  value={component.props.title ?? ""}
                  placeholder={`${page.title.trim() || "ללא כותרת"} | סרטון`}
                  onChange={(event) =>
                    handlePropsChange(component.id, {
                      ...component.props,
                      title: event.target.value,
                    })
                  }
                />
              </HeaderFieldPopover>
              <HeaderFieldPopover
                open={fieldIsOpen("video-url")}
                label="קישור לוידאו"
                title="עריכת קישור לוידאו"
                icon={<LinkIcon className="w-4 h-4" />}
                onToggle={() => toggleHeaderField(component.id, "video-url")}
                onClose={closeHeaderField}
              >
                <TextField
                  dir="ltr"
                  autoFocus
                  value={component.props.url ?? ""}
                  placeholder="https://www.youtube.com/watch?v=..."
                  onChange={(event) => {
                    const url = event.target.value;
                    handlePropsChange(component.id, {
                      ...component.props,
                      url,
                      provider: detectVideoProvider(url),
                    });
                  }}
                />
              </HeaderFieldPopover>
            </div>
          )}
          <span className="ms-auto flex items-center gap-2">
            {isImplement && (
              <StatusBadge
                status={status}
                onClick={() => handleCycleStatus(component)}
              />
            )}
            {isImplement && (
              <button
                type="button"
                className="p-1.5 text-current opacity-60 hover:opacity-100 transition-opacity duration-fast"
                title="העתק"
                aria-label="העתק"
                onClick={() =>
                  handleCopyAndMark(component.id, headerCopyPayload(component))
                }
              >
                <CopyIcon className="w-4 h-4" />
              </button>
            )}
            {editable && (
              <>
                <button
                  type="button"
                  className="p-1.5 text-surface-400 hover:text-surface-900 transition-colors duration-fast"
                  title="שכפל רכיב"
                  aria-label="שכפל רכיב"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDuplicate(component);
                  }}
                >
                  <DuplicateIcon className="w-5 h-5" />
                </button>
                <button
                  type="button"
                  className="p-1.5 text-surface-400 hover:text-danger transition-colors duration-fast"
                  title="מחק רכיב"
                  aria-label="מחק רכיב"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDelete(component.id);
                  }}
                >
                  <TrashIcon />
                </button>
              </>
            )}
          </span>
        </div>
        <div className={flushBody ? undefined : "p-4"}>
          {renderBlock(component)}
          {isImplement &&
            component.type !== "text" &&
            component.props.notes?.trim() && (
            <div className={flushBody ? "px-4 py-3" : "mt-3"}>
              <NotesDisplay notes={component.props.notes} />
            </div>
          )}
        </div>
      </Card>
    );
  }

  const pageHeader = (
    <div className={`flex flex-col gap-1 ${editable ? "" : "mb-4"}`}>
      <div className="flex items-center gap-1.5 text-3xl font-semibold tracking-tight text-surface-900">
        {numbering ? (
          <>
            <span className="shrink-0">{numbering}</span>
            <span className="shrink-0" aria-hidden>
              |
            </span>
          </>
        ) : null}
        {editable ? (
          <input
            value={page.title}
            placeholder="כותרת העמוד"
            onChange={(e) => handleTitleChange(e.target.value)}
            className="flex-1 min-w-0 bg-transparent outline-none border-b border-transparent transition-colors duration-fast"
          />
        ) : (
          <h1 className="flex-1 min-w-0 truncate">{page.title}</h1>
        )}
        {editable && (
          <PageWorkflowStatusToggle
            status={page.workflow_status}
            onClick={handleToggleWorkflowStatus}
          />
        )}
        {isImplement && components !== null && components.length > 0 && (
          <StatusBadge
            status={pageAggregateStatus(components)}
            onClick={handleCyclePageStatus}
          />
        )}
      </div>
      {isImplement && rollup && rollup.total_count > 0 && (
        <span className="text-sm text-surface-500">
          {rollup.implemented_count}/{rollup.total_count} רכיבים הוטמעו
          {rollup.needs_update_count > 0 && ` · ${rollup.needs_update_count} עברו שינוי`}
        </span>
      )}
    </div>
  );

  return (
    <div className="flex flex-col max-w-3xl w-full mx-auto ps-12 pe-6 py-6">
      {/* Page header — edit: notes icon in the same gutter as block comments */}
      {editable ? (
        <PageNotes
          notes={page.notes ?? ""}
          open={openCommentId === PAGE_NOTES_OPEN_ID}
          onToggle={() =>
            setOpenCommentId((prev) =>
              prev === PAGE_NOTES_OPEN_ID ? null : PAGE_NOTES_OPEN_ID
            )
          }
          onChange={handleNotesChange}
        >
          {pageHeader}
        </PageNotes>
      ) : (
        pageHeader
      )}

      {/* Notes for implementers — implement only (edit uses PageNotes panel) */}
      {isImplement && page.notes?.trim() && (
        <div className="flex flex-col gap-1.5 mb-6">
          <span className="text-sm font-semibold text-surface-700">הערות להטמעה</span>
          <p className="text-base text-danger whitespace-pre-wrap">{page.notes}</p>
        </div>
      )}

      {error && (
        <Card className="border-danger bg-red-50 mb-4">
          <p className="text-base text-danger">{error}</p>
        </Card>
      )}

      {/* Components */}
      {components === null && !error && (
        <div className="flex items-center gap-2 text-base text-surface-600">
          <Spinner size="sm" />
          טוען רכיבים...
        </div>
      )}

      {components !== null && (
        <>
          {components.length === 0 && (
            <p className="text-base text-surface-400 mb-4">
              {editable
                ? "אין עדיין רכיבים בעמוד. הוסיפו רכיב ראשון למטה."
                : "אין רכיבים בעמוד."}
            </p>
          )}

          {editable ? (
            <SortableList
              items={components}
              onReorder={handleReorder}
              renderItem={(component, handle) => renderComponentCard(component, handle)}
            />
          ) : isReview ? (
            components.map((component) => (
              <div key={component.id}>{renderPreviewBlock(component)}</div>
            ))
          ) : (
            components.map((component) => (
              <div key={component.id}>{renderComponentCard(component)}</div>
            ))
          )}

          {editable && (
            <div className="border border-dashed border-surface-300 p-4 mt-1">
              <span className="text-sm font-semibold text-surface-500 flex items-center gap-1.5 mb-3">
                <PlusIcon className="w-3.5 h-3.5" />
                הוסף רכיב
              </span>
              <div className="flex flex-wrap gap-2">
                {(Object.keys(typeMeta) as ComponentType[]).map((type) => (
                  <Button
                    key={type}
                    size="sm"
                    variant="secondary"
                    leftIcon={typeMeta[type].icon}
                    onClick={() => handleAdd(type)}
                  >
                    {typeMeta[type].label}
                  </Button>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {(prevPage || nextPage) && (
        <nav
          className="flex items-start justify-between gap-6 mt-10 pt-6 border-t border-surface-200"
          aria-label="ניווט בין עמודים"
        >
          {/* Previous — start side (visual right in RTL) */}
          {prevPage ? (
            <button
              type="button"
              onClick={() => onNavigatePage(prevPage.id)}
              className="flex items-center gap-1.5 min-w-0 max-w-[45%] text-start text-base text-[#0F6CBF] hover:underline"
            >
              <ChevronRightIcon className="w-4 h-4 shrink-0" />
              <span className="min-w-0 truncate">
                {prevPage.numbering
                  ? `${prevPage.numbering} | ${prevPage.title}`
                  : prevPage.title}
              </span>
            </button>
          ) : (
            <span />
          )}

          {/* Next — end side (visual left in RTL) */}
          {nextPage ? (
            <button
              type="button"
              onClick={() => onNavigatePage(nextPage.id)}
              className="flex items-center gap-1.5 min-w-0 max-w-[45%] text-end text-base text-[#0F6CBF] hover:underline ms-auto"
            >
              <span className="min-w-0 truncate">
                {nextPage.numbering
                  ? `${nextPage.numbering} | ${nextPage.title}`
                  : nextPage.title}
              </span>
              <ChevronLeftIcon className="w-4 h-4 shrink-0" />
            </button>
          ) : (
            <span />
          )}
        </nav>
      )}
    </div>
  );
}
