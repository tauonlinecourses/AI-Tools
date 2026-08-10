import { useEffect, useRef, useState } from "react";
import { Button, Card, Spinner } from "@workspace/ui";
import type {
  BlockProps,
  ComponentType,
  CourseViewMode,
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
import { BlockRenderer } from "./blocks/BlockRenderer";
import { NotesDisplay } from "./blocks/fields";
import { StatusBadge, nextStatus, statusBorderClass, statusHeaderClass } from "./StatusBadge";
import {
  BannerIcon,
  ChevronDownIcon,
  CopyIcon,
  GripIcon,
  PlusIcon,
  QuestionIcon,
  TextIcon,
  TrashIcon,
  VideoIcon,
} from "./icons";

type ClipboardPayload = { html?: string; plain: string };

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
      return { url: "", provider: "youtube" };
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

interface PageContentProps {
  page: Page;
  numbering: string;
  mode: CourseViewMode;
  rollup?: StatusRollup;
  /** Notify the shell that page title/notes changed (to refresh the sidebar). */
  onPageChange: (fields: Partial<Pick<Page, "title" | "notes">>) => void;
  /** Notify the shell that implementation status may have changed (implement rollups). */
  onStatusChange: () => void;
}

export function PageContent({
  page,
  numbering,
  mode,
  rollup,
  onPageChange,
  onStatusChange,
}: PageContentProps) {
  const { trackSave, beginSave, endSave } = useSaveStatus();
  const editable = mode === "edit";
  const isImplement = mode === "implement";
  const isReview = mode === "review";

  const [components, setComponents] = useState<PageComponent[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** Video (and similar) blocks: which component cards have their settings panel open. */
  const [openSettings, setOpenSettings] = useState<Set<string>>(new Set());

  // Debounced persistence for block props and page fields.
  const timers = useRef(new Map<string, number>());
  const pendingProps = useRef(new Map<string, BlockProps>());

  useEffect(() => {
    setComponents(null);
    setError(null);
    setOpenSettings(new Set());
    api
      .listComponents(page.id)
      .then(setComponents)
      .catch((e: Error) => setError(e.message));

    const timersMap = timers.current;
    const pendingMap = pendingProps.current;
    return () => {
      // Flush unsaved block edits when leaving the page.
      for (const [key, t] of timersMap) {
        window.clearTimeout(t);
        endSave(key);
      }
      timersMap.clear();
      for (const [id, props] of pendingMap) {
        trackSave(api.updateComponentProps(id, props)).catch(() => undefined);
      }
      pendingMap.clear();
    };
  }, [page.id, trackSave, endSave]);

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
      onStatusChange();
    });
  }

  function handleTitleChange(title: string) {
    onPageChange({ title });
    scheduleSave(`page-title:${page.id}`, () => api.updatePage(page.id, { title }));
  }

  function handleNotesChange(notes: string) {
    onPageChange({ notes });
    scheduleSave(`page-notes:${page.id}`, () => api.updatePage(page.id, { notes }));
  }

  function toggleSettings(id: string) {
    setOpenSettings((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
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
      if (type === "video" || type === "banner") {
        setOpenSettings((prev) => new Set(prev).add(created.id));
      }
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
      onStatusChange();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  function handleReorder(next: PageComponent[]) {
    setComponents(next);
    trackSave(api.reorderComponents(next.map((c) => c.id)))
      .then(() => onStatusChange())
      .catch((e: Error) => setError(e.message));
  }

  async function handleCopyAndMark(id: string, payload: string | ClipboardPayload) {
    setError(null);
    try {
      const clip = typeof payload === "string" ? { plain: payload } : payload;
      await writeClipboard(clip);
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

  function renderBlock(component: PageComponent) {
    const settingsOpen = openSettings.has(component.id);
    return (
      <BlockRenderer
        type={component.type}
        props={component.props}
        mode={mode}
        onChange={(props) => handlePropsChange(component.id, props)}
        settingsOpen={settingsOpen}
        onToggleSettings={() => toggleSettings(component.id)}
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

  /** Polished preview: no card chrome — just stacked blocks. */
  function renderPreviewBlock(component: PageComponent) {
    return (
      <div key={component.id} className="mb-6">
        {renderBlock(component)}
      </div>
    );
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
    const settingsOpen = openSettings.has(component.id);
    const headerTogglesSettings = editable && (isVideo || isBanner);

    return (
      <Card
        padding="none"
        border={false}
        className={`mb-3 border-2 transition-colors duration-fast ${
          isImplement ? statusBorderClass(status) : "border-surface-200"
        }`}
      >
        <div
          className={`flex items-center gap-2 px-3 h-10 border-b-2 transition-colors duration-fast ${
            editable
              ? "border-surface-200 bg-[#F8F9FA]"
              : statusHeaderClass(status)
          } ${headerTogglesSettings ? "cursor-pointer select-none" : ""}`}
          onClick={headerTogglesSettings ? () => toggleSettings(component.id) : undefined}
          role={headerTogglesSettings ? "button" : undefined}
          aria-expanded={headerTogglesSettings ? settingsOpen : undefined}
          title={
            headerTogglesSettings
              ? isVideo
                ? "לחצו לפתיחת הגדרות הוידאו"
                : "לחצו לפתיחת הגדרות הבאנר"
              : undefined
          }
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
          {headerTogglesSettings && (
            <ChevronDownIcon
              className={`w-3.5 h-3.5 text-surface-400 transition-transform duration-fast ${
                settingsOpen ? "rotate-180" : ""
              }`}
            />
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
              <button
                className="p-1.5 text-surface-400 hover:text-danger transition-colors duration-fast"
                title="מחק רכיב"
                onClick={(e) => {
                  e.stopPropagation();
                  handleDelete(component.id);
                }}
              >
                <TrashIcon />
              </button>
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

  return (
    <div className="flex flex-col max-w-3xl w-full mx-auto px-6 py-6">
      {/* Page header — same `1.1 | title` pattern as the sidebar (home page: title only) */}
      <div className="flex flex-col gap-1 mb-4">
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
            <h1 className="min-w-0 truncate">{page.title}</h1>
          )}
        </div>
        {isImplement && rollup && rollup.total_count > 0 && (
          <span className="text-sm text-surface-500">
            {rollup.implemented_count}/{rollup.total_count} רכיבים הוטמעו
            {rollup.needs_update_count > 0 && ` · ${rollup.needs_update_count} דורשים עדכון`}
          </span>
        )}
      </div>

      {/* Notes for implementers — edit + implement only */}
      {editable && (
        <div className="flex flex-col gap-1.5 mb-6">
          <span className="text-sm font-semibold text-surface-700">הערות להטמעה</span>
          <textarea
            rows={1}
            value={page.notes ?? ""}
            placeholder="הערות חופשיות על העמוד (יוצגו גם בתצוגת ההטמעה)"
            onChange={(e) => handleNotesChange(e.target.value)}
            className="w-full px-3 py-2 text-base leading-6 bg-surface-50 border border-surface-200 text-surface-900 placeholder:text-surface-400 outline-none transition-colors duration-fast resize-y"
          />
        </div>
      )}
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
            components.map((component) => renderPreviewBlock(component))
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
    </div>
  );
}
