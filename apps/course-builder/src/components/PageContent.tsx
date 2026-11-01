import { useEffect, useRef, useState } from "react";
import { Card, Spinner } from "@workspace/ui";
import type {
  BlockProps,
  ButtonAlign,
  ComponentComment,
  ComponentType,
  CourseViewMode,
  ImplementationStatus,
  Page,
  PageComment,
  PageComponent,
  PageType,
  PageWorkflowStatus,
  QuestionProps,
  Section,
  StatusRollup,
} from "../lib/types";
import {
  componentStatus,
  ACTIVITY_TYPES,
  PINNED_BOTTOM_TYPES,
  SINGLETON_ACTIVITY_TYPES,
  derivePageType,
  isHomePage,
  PAGE_TYPE_LABEL,
  PAGE_TYPE_LOGO,
  QUESTION_TYPE_LABEL,
} from "../lib/types";
import type { QuestionType } from "../lib/types";
import * as api from "../lib/api";
import { writeClipboard } from "../lib/clipboard";
import { useSaveStatus } from "../lib/saveStatus";
import { htmlToPlainText, resolveTextHtml, sanitizeTextHtml } from "../lib/textHtml";
import { SortableList } from "./SortableList";
import { BlockComments } from "./BlockComments";
import { BlockRenderer } from "./blocks/BlockRenderer";
import { NotesDisplay, TextField } from "./blocks/fields";
import { detectVideoProvider } from "../lib/videoEmbed";
import { validatePageQuestions } from "../lib/questionValidation";
import {
  PageWorkflowStatusToggle,
  StatusBadge,
  nextStatus,
  statusBorderClass,
  statusHeaderClass,
} from "./StatusBadge";
import {
  AlignIcon,
  BannerIcon,
  ButtonIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CopyIcon,
  DuplicateIcon,
  GripIcon,
  LinkIcon,
  LockIcon,
  PencilIcon,
  PlusIcon,
  QuestionIcon,
  TextIcon,
  InteractiveUnitIcon,
  TextUnitIcon,
  ThumbnailIcon,
  TrashIcon,
  VideoIcon,
} from "./icons";
import { LessonFilesButton, LessonVideosButton } from "./LessonFilesButton";
import { LessonPagesCard } from "./LessonPagesCard";

/** Sentinel for the open page-header comment thread (mutually exclusive with block threads). */
const PAGE_COMMENTS_OPEN_ID = "__page_comments__";

const COPIED_FEEDBACK_MS = 2000;

type ClipboardPayload = { html?: string; plain: string };
type HeaderField =
  | "banner-url"
  | "video-title"
  | "video-url"
  | "image-image-url"
  | "text-unit-image-url"
  | "text-unit-file-url"
  | "button-text"
  | "button-align"
  | "button-url";

const BUTTON_ALIGN_OPTIONS: { value: ButtonAlign; label: string }[] = [
  { value: "right", label: "ימין" },
  { value: "center", label: "מרכז" },
  { value: "left", label: "שמאל" },
];

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
          className="absolute top-full start-0 z-[60] mt-2 w-72 border border-surface-200 bg-white p-3 shadow-lg"
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

/** Implement-mode header control: open a stored URL in a new tab (disabled when empty). */
function HeaderOpenUrlButton({
  url,
  label,
  missingLabel,
  icon,
}: {
  url?: string;
  label: string;
  missingLabel: string;
  icon: React.ReactNode;
}) {
  const href = url?.trim() || undefined;
  if (!href) {
    return (
      <span
        role="link"
        aria-disabled="true"
        aria-label={missingLabel}
        title={missingLabel}
        className="p-1.5 text-surface-300 cursor-not-allowed"
      >
        {icon}
      </span>
    );
  }
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      title={label}
      aria-label={label}
      className="p-1.5 text-surface-500 hover:bg-surface-200 hover:text-surface-900 transition-colors duration-fast"
      onClick={(event) => event.stopPropagation()}
    >
      {icon}
    </a>
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
    case "interactive_video":
      return { plain: component.props.url ?? "" };
    case "question":
      return { plain: component.props.prompt ?? "" };
    case "image":
      return { plain: component.props.imageUrl ?? "" };
    case "text_unit":
    case "interactive_unit":
      return {
        plain:
          component.props.fileUrl?.trim() ||
          component.props.imageUrl?.trim() ||
          "",
      };
    case "button":
      return {
        plain:
          component.props.url?.trim() ||
          component.props.text?.trim() ||
          "כפתור",
      };
    case "notes_board":
      return { plain: component.props.description ?? "" };
    case "word_cloud":
      return { plain: component.props.centerWord ?? "" };
    case "forum":
      return { plain: component.props.title?.trim() || "פורום" };
  }
}

const SAVE_DEBOUNCE_MS = 700;

function activityTypeLogo(
  pageType: "h5p" | "notes_board" | "word_cloud" | "forum",
  className = "w-4 h-4 object-contain shrink-0"
) {
  return (
    <img
      src={PAGE_TYPE_LOGO[pageType]}
      alt=""
      title={PAGE_TYPE_LABEL[pageType]}
      className={className}
    />
  );
}

const typeMeta: Record<ComponentType, { label: string; icon: React.ReactNode }> = {
  banner: { label: "באנר", icon: <BannerIcon /> },
  video: { label: "וידאו", icon: <VideoIcon /> },
  interactive_video: { label: "וידאו אינטרקטיבי", icon: <VideoIcon /> },
  text: { label: "טקסט", icon: <TextIcon /> },
  question: { label: "שאלה", icon: <QuestionIcon /> },
  image: { label: "תמונה", icon: <ThumbnailIcon /> },
  text_unit: { label: "יחידת טקסט", icon: <TextUnitIcon /> },
  interactive_unit: {
    label: "יחידה אינטראקטיבית",
    icon: <InteractiveUnitIcon />,
  },
  button: { label: "כפתור", icon: <ButtonIcon /> },
  notes_board: { label: "לוח פתקים", icon: activityTypeLogo("notes_board") },
  word_cloud: { label: "ענן מילים", icon: activityTypeLogo("word_cloud") },
  forum: { label: "פורום", icon: activityTypeLogo("forum") },
};

/** Implement-sidebar page-type logo for each activity component type. */
function activityPickerPageType(
  type: "question" | "notes_board" | "word_cloud" | "forum"
): "h5p" | "notes_board" | "word_cloud" | "forum" {
  return type === "question" ? "h5p" : type;
}

const MAIN_COMPONENT_TYPES: ComponentType[] = [
  "banner",
  "video",
  "text",
  "image",
  "text_unit",
  "interactive_unit",
  "button",
];
const ACTIVITY_COMPONENT_TYPES: ComponentType[] = [
  "question",
  "notes_board",
  "word_cloud",
  "forum",
];

/** Larger icons for the add-component picker tiles. */
function pickerTileIcon(type: ComponentType): React.ReactNode {
  const cls = "w-5 h-5";
  switch (type) {
    case "banner":
      return <BannerIcon className={cls} />;
    case "video":
    case "interactive_video":
      return <VideoIcon className={cls} />;
    case "text":
      return <TextIcon className={cls} />;
    case "image":
      return <ThumbnailIcon className={cls} />;
    case "text_unit":
      return <TextUnitIcon className={cls} />;
    case "interactive_unit":
      return <InteractiveUnitIcon className={cls} />;
    case "button":
      return <ButtonIcon className={cls} />;
    case "question":
    case "notes_board":
    case "word_cloud":
    case "forum":
      return activityTypeLogo(
        activityPickerPageType(type),
        "w-5 h-5 object-contain shrink-0"
      );
  }
}

function canAddActivityType(
  type: ComponentType,
  list: PageComponent[],
  isHome: boolean
): boolean {
  if (isHome || !ACTIVITY_TYPES.has(type)) return false;
  const otherKind = list.find((c) => ACTIVITY_TYPES.has(c.type) && c.type !== type);
  if (otherKind) return false;
  if (SINGLETON_ACTIVITY_TYPES.has(type) && list.some((c) => c.type === type)) {
    return false;
  }
  return true;
}

function AddComponentTile({
  type,
  disabled,
  onAdd,
}: {
  type: ComponentType;
  disabled?: boolean;
  onAdd: (type: ComponentType) => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onAdd(type)}
      className={`flex flex-col items-center justify-center gap-2 rounded-[12px] bg-white px-2 py-3.5 transition-colors duration-fast ${
        disabled
          ? "cursor-not-allowed opacity-40 shadow-none"
          : "shadow-[0_1px_3px_rgba(15,108,191,0.1)] hover:bg-[#F8FBFE] hover:shadow-[0_2px_6px_rgba(15,108,191,0.14)]"
      }`}
    >
      <span
        className={`flex h-9 w-9 items-center justify-center rounded-[8px] ${
          disabled ? "bg-[#E8EEF4] text-surface-400" : "bg-[#E8F2FB] text-[#0F6CBF]"
        }`}
        aria-hidden
      >
        {pickerTileIcon(type)}
      </span>
      <span
        className={`text-sm font-medium ${
          disabled ? "text-surface-400" : "text-[#1B3A5C]"
        }`}
      >
        {typeMeta[type].label}
      </span>
    </button>
  );
}

function emptyChoiceOptions(count: number) {
  return Array.from({ length: count }, () => ({
    id: crypto.randomUUID(),
    text: "",
  }));
}

/** New choice question: 4 empty options, first marked correct. */
function defaultChoiceQuestionProps(): QuestionProps {
  const options = emptyChoiceOptions(4);
  return {
    questionType: "single_choice",
    prompt: "",
    options,
    correctOptionId: options[0]?.id,
  };
}

function defaultProps(type: ComponentType): BlockProps {
  switch (type) {
    case "banner":
      return { title: "" };
    case "video":
      return { url: "" };
    case "interactive_video":
      return {
        url: "",
        questions: [defaultChoiceQuestionProps()],
      };
    case "text":
      return { html: "" };
    case "question":
      return defaultChoiceQuestionProps();
    case "image":
      return { imageUrl: "" };
    case "text_unit":
    case "interactive_unit":
      return { imageUrl: "", fileUrl: "" };
    case "button":
      return { text: "", align: "center", url: "" };
    case "word_cloud":
      return { centerWord: "" };
    case "notes_board":
      return {
        description: "",
        columns: [
          { id: crypto.randomUUID(), title: "", items: [] },
          { id: crypto.randomUUID(), title: "", items: [] },
          { id: crypto.randomUUID(), title: "", items: [] },
        ],
      };
    case "forum":
      return { title: "פורום" };
  }
}

interface AdjacentPageLink {
  id: string;
  title: string;
}

/** Course structure shown under home-page components (all lessons + pages). */
export interface HomeCourseStructure {
  sections: Section[];
  pagesBySection: Map<string, Page[]>;
  pageTypes: Map<string, PageType>;
  onSelectPage: (pageId: string) => void;
  onSelectSection: (sectionId: string) => void;
}

interface PageContentProps {
  page: Page;
  /** Course id for nested mutations (avoids an extra page→course lookup on add). */
  courseId: string;
  mode: CourseViewMode;
  /** Lesson files folder URL for page-header button (lesson pages only). */
  lessonFilesFolderUrl?: string | null;
  /** Lesson videos folder URL for page-header button (lesson pages only). */
  lessonVideosFolderUrl?: string | null;
  /** When set on the course home page, renders Moodle-style lesson cards below content. */
  homeCourseStructure?: HomeCourseStructure | null;
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
  /** Notify the shell that block comments were added/removed (sidebar counts). */
  onCommentsChange?: () => void;
}

export function PageContent({
  page,
  courseId,
  mode,
  lessonFilesFolderUrl,
  lessonVideosFolderUrl,
  homeCourseStructure,
  rollup,
  prevPage,
  nextPage,
  onNavigatePage,
  onPageChange,
  onStatusChange,
  onContentChange,
  onCommentsChange,
}: PageContentProps) {
  const { trackSave, beginSave, endSave } = useSaveStatus();
  const editable = mode === "edit";
  const isImplement = mode === "implement";
  const isReview = mode === "review";
  const isHome = isHomePage(page);

  const [components, setComponents] = useState<PageComponent[] | null>(null);
  const [commentsByComponent, setCommentsByComponent] = useState<
    Map<string, ComponentComment[]>
  >(new Map());
  const [pageComments, setPageComments] = useState<PageComment[]>([]);
  /** At most one open comment thread at a time. */
  const [openCommentId, setOpenCommentId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** At most one field popover in a block header is open. */
  const [openHeaderField, setOpenHeaderField] = useState<string | null>(null);
  /** Implement header copy feedback — which component just copied. */
  const [copiedComponentId, setCopiedComponentId] = useState<string | null>(null);

  // Debounced persistence for block props and page fields.
  const timers = useRef(new Map<string, number>());
  const pendingProps = useRef(new Map<string, BlockProps>());
  /** In-flight optimistic inserts — later mutations wait so the row exists first. */
  const pendingInserts = useRef(new Map<string, Promise<void>>());
  const copiedTimer = useRef<number | null>(null);

  // The shell re-creates these callbacks on every render (including the ones
  // caused by the save indicator), so they must stay out of the load effect's
  // deps — otherwise any save would refetch the page and close open panels.
  const flushDeps = useRef({ trackSave, endSave, onContentChange });
  flushDeps.current = { trackSave, endSave, onContentChange };

  async function waitForInsert(id: string) {
    const pending = pendingInserts.current.get(id);
    if (pending) await pending;
  }

  useEffect(() => {
    setComponents(null);
    setCommentsByComponent(new Map());
    setPageComments([]);
    setOpenCommentId(null);
    setError(null);
    setOpenHeaderField(null);
    setCopiedComponentId(null);
    if (copiedTimer.current) {
      window.clearTimeout(copiedTimer.current);
      copiedTimer.current = null;
    }
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
    api
      .listPageComments(page.id)
      .then(setPageComments)
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
      const insertsMap = pendingInserts.current;
      for (const [id, props] of pendingMap) {
        flush
          .trackSave(
            (async () => {
              const pending = insertsMap.get(id);
              if (pending) await pending;
              await api.updateComponentProps(id, props);
              flush.onContentChange();
            })()
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
      await waitForInsert(id);
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

  function handleVideoTypeChange(component: PageComponent, newType: ComponentType) {
    if (component.type === newType) return;
    const newProps: BlockProps = { ...component.props };
    if (newType === "interactive_video" && !newProps.questions) {
      newProps.questions = [defaultChoiceQuestionProps()];
    }
    setComponents((prev) =>
      prev ? prev.map((c) => (c.id === component.id ? { ...c, type: newType, props: newProps } : c)) : prev
    );
    scheduleSave(`component:${component.id}`, async () => {
      await waitForInsert(component.id);
      const updated = await api.updateComponentType(component.id, newType, newProps);
      setComponents((prev) =>
        prev ? prev.map((c) => (c.id === component.id ? { ...c, updated_at: updated.updated_at } : c)) : prev
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

  async function handleSetWorkflowStatus(workflow_status: PageWorkflowStatus) {
    if (workflow_status === page.workflow_status) return;

    if (workflow_status === "ready_for_implementation") {
      const message = validatePageQuestions(components);
      if (message) {
        window.alert(message);
        return;
      }
    }

    const previous = page.workflow_status;
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
      if (c.type === "video" || c.type === "interactive_video") map.set(c.id, ++n);
    }
    return map;
  })();

  /** 1-based ordinal of each image among image components on this page (current order). */
  const imageNumberById = (() => {
    const map = new Map<string, number>();
    if (!components) return map;
    let n = 0;
    for (const c of components) {
      if (c.type === "image") map.set(c.id, ++n);
    }
    return map;
  })();

  /** 1-based ordinals for text_unit / interactive_unit among their own type. */
  const unitNumberById = (() => {
    const map = new Map<string, number>();
    if (!components) return map;
    let textN = 0;
    let interactiveN = 0;
    for (const c of components) {
      if (c.type === "text_unit") map.set(c.id, ++textN);
      else if (c.type === "interactive_unit") map.set(c.id, ++interactiveN);
    }
    return map;
  })();

  async function handleAdd(type: ComponentType) {
    setError(null);
    const list = components ?? [];

    if (isHome && ACTIVITY_TYPES.has(type)) {
      window.alert("לא ניתן להוסיף פעילויות לדף הבית. ניתן להוסיף רק רכיבי תוכן.");
      return;
    }

    if (ACTIVITY_TYPES.has(type)) {
      const otherKind = list.find(
        (c) => ACTIVITY_TYPES.has(c.type) && c.type !== type
      );
      if (otherKind) {
        const existingLabel = typeMeta[otherKind.type]?.label ?? otherKind.type;
        const newLabel = typeMeta[type]?.label ?? type;
        window.alert(
          `לא ניתן להוסיף "${newLabel}" — כבר קיימת פעילות מסוג "${existingLabel}" בעמוד זה. ניתן להוסיף רק סוג פעילות אחד בכל עמוד.`
        );
        return;
      }
      // notes_board / word_cloud / forum: only one instance; question may repeat.
      if (SINGLETON_ACTIVITY_TYPES.has(type) && list.some((c) => c.type === type)) {
        const label = typeMeta[type]?.label ?? type;
        window.alert(
          `לא ניתן להוסיף עוד "${label}" — ניתן להוסיף פעילות זו פעם אחת בלבד בכל עמוד (רק שאלה ניתנת להוספה יותר מפעם אחת).`
        );
        return;
      }
    }

    const isPinned = PINNED_BOTTOM_TYPES.has(type);
    let insertIdx: number;
    if (isPinned) {
      insertIdx = list.length;
    } else {
      const firstPinnedIdx = list.findIndex((c) => PINNED_BOTTOM_TYPES.has(c.type));
      insertIdx = firstPinnedIdx === -1 ? list.length : firstPinnedIdx;
    }

    const props = defaultProps(type);
    const now = new Date().toISOString();
    const optimistic: PageComponent = {
      id: crypto.randomUUID(),
      page_id: page.id,
      type,
      position: insertIdx,
      props,
      implemented_at: null,
      updated_at: now,
    };
    const next = [
      ...list.slice(0, insertIdx),
      optimistic,
      ...list.slice(insertIdx),
    ].map((c, position) => ({ ...c, position }));
    // Paint immediately; persist in the background with the same client id.
    setComponents(next);

    let resolveInsert!: () => void;
    let rejectInsert!: (reason: unknown) => void;
    const insertReady = new Promise<void>((resolve, reject) => {
      resolveInsert = resolve;
      rejectInsert = reject;
    });
    pendingInserts.current.set(optimistic.id, insertReady);

    let inserted = false;
    try {
      await trackSave(
        (async () => {
          try {
            await api.addComponent(page.id, type, insertIdx, props, {
              id: optimistic.id,
              courseId,
            });
            inserted = true;
            resolveInsert();
          } catch (err) {
            rejectInsert(err);
            throw err;
          }
          if (insertIdx < list.length) {
            await api.reorderComponents(next.map((c) => c.id));
          }
        })()
      );
      pendingInserts.current.delete(optimistic.id);
      onContentChange();
      onStatusChange();
    } catch (e) {
      pendingInserts.current.delete(optimistic.id);
      if (!inserted) setComponents(list);
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function handleDelete(id: string) {
    if (!window.confirm("למחוק את הרכיב?")) return;
    setError(null);
    const previous = components;
    setComponents((prev) => prev?.filter((c) => c.id !== id) ?? prev);
    setCommentsByComponent((prev) => {
      const next = new Map(prev);
      next.delete(id);
      return next;
    });
    if (openCommentId === id) setOpenCommentId(null);
    try {
      await waitForInsert(id);
      await trackSave(api.deleteComponent(id));
      onContentChange();
      onStatusChange();
    } catch (e) {
      setComponents(previous);
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function handleDuplicate(component: PageComponent) {
    setError(null);
    if (SINGLETON_ACTIVITY_TYPES.has(component.type)) {
      const label = typeMeta[component.type]?.label ?? component.type;
      window.alert(
        `לא ניתן לשכפל "${label}" — ניתן להוסיף פעילות זו פעם אחת בלבד בכל עמוד (רק שאלה ניתנת להוספה יותר מפעם אחת).`
      );
      return;
    }

    const list = components ?? [];
    const idx = list.findIndex((c) => c.id === component.id);
    if (idx < 0) return;

    // Source must be persisted before we clone it server-side.
    try {
      await waitForInsert(component.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return;
    }

    const props = api.propsForDuplicatedBlock(component);
    const now = new Date().toISOString();
    const optimistic: PageComponent = {
      id: crypto.randomUUID(),
      page_id: page.id,
      type: component.type,
      position: idx + 1,
      props,
      implemented_at: null,
      updated_at: now,
    };
    const next = [
      ...list.slice(0, idx + 1),
      optimistic,
      ...list.slice(idx + 1),
    ].map((c, position) => ({ ...c, position }));
    setComponents(next);

    let resolveInsert!: () => void;
    let rejectInsert!: (reason: unknown) => void;
    const insertReady = new Promise<void>((resolve, reject) => {
      resolveInsert = resolve;
      rejectInsert = reject;
    });
    pendingInserts.current.set(optimistic.id, insertReady);

    let inserted = false;
    try {
      await trackSave(
        (async () => {
          try {
            await api.duplicateComponent(component.id, {
              id: optimistic.id,
              courseId,
              pageId: page.id,
              type: component.type,
              props,
              orderedIds: next.map((c) => c.id),
            });
            inserted = true;
            resolveInsert();
          } catch (err) {
            rejectInsert(err);
            throw err;
          }
        })()
      );
      pendingInserts.current.delete(optimistic.id);
      onContentChange();
      onStatusChange();
    } catch (e) {
      pendingInserts.current.delete(optimistic.id);
      if (!inserted) setComponents(list);
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function handleAddComment(componentId: string, body: string) {
    setError(null);
    try {
      await waitForInsert(componentId);
      const created = await trackSave(api.addComment(componentId, mode, body));
      setCommentsByComponent((prev) => {
        const next = new Map(prev);
        const list = [...(next.get(componentId) ?? []), created];
        next.set(componentId, list);
        return next;
      });
      onCommentsChange?.();
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
      onCommentsChange?.();
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
      onCommentsChange?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      throw e;
    }
  }

  async function handleAddPageComment(body: string) {
    setError(null);
    try {
      const created = await trackSave(api.addPageComment(page.id, mode, body));
      setPageComments((prev) => [...prev, created]);
      onCommentsChange?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      throw e;
    }
  }

  async function handleSetPageCommentResolved(
    commentId: string,
    resolved: boolean
  ) {
    setError(null);
    try {
      const updated = await trackSave(
        api.setPageCommentResolved(commentId, resolved)
      );
      setPageComments((prev) =>
        prev.map((c) => (c.id === updated.id ? updated : c))
      );
      onCommentsChange?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      throw e;
    }
  }

  async function handleDeletePageComment(commentId: string) {
    setError(null);
    try {
      await trackSave(api.deletePageComment(commentId));
      setPageComments((prev) => prev.filter((c) => c.id !== commentId));
      onCommentsChange?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      throw e;
    }
  }

  function wrapWithComments(componentId: string, block: React.ReactNode) {
    return (
      <BlockComments
        comments={commentsByComponent.get(componentId) ?? []}
        mode={mode}
        open={openCommentId === componentId}
        elevate={!!openHeaderField?.startsWith(`${componentId}:`)}
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
    trackSave(
      (async () => {
        await Promise.all(next.map((c) => waitForInsert(c.id)));
        await api.reorderComponents(next.map((c) => c.id));
      })()
    )
      .then(() => {
        onContentChange();
        onStatusChange();
      })
      .catch((e: Error) => setError(e.message));
  }

  /** Clipboard only — status is changed manually via the status badge. */
  async function handleCopy(
    payload: string | ClipboardPayload,
    componentId?: string
  ) {
    setError(null);
    try {
      const clip = typeof payload === "string" ? { plain: payload } : payload;
      await writeClipboard(clip);
      if (componentId) {
        setCopiedComponentId(componentId);
        if (copiedTimer.current) window.clearTimeout(copiedTimer.current);
        copiedTimer.current = window.setTimeout(() => {
          setCopiedComponentId(null);
          copiedTimer.current = null;
        }, COPIED_FEEDBACK_MS);
      }
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
    const targetLabel = target === "implemented" ? "הוטמע" : "לא הוטמע";
    if (
      !window.confirm(
        `האם לשנות את הסטטוס של כל הרכיבים בעמוד ל"${targetLabel}"?`
      )
    ) {
      return;
    }
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
        videoNumber={videoNumberById.get(component.id)}
        imageNumber={imageNumberById.get(component.id)}
        unitNumber={unitNumberById.get(component.id)}
        onCopyOption={
          isImplement && (component.type === "question" || component.type === "interactive_video")
            ? (text) => handleCopy(text)
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
    const meta = typeMeta[component.type] ?? typeMeta.image;
    const status = componentStatus(component);
    const isPinned = PINNED_BOTTOM_TYPES.has(component.type);
    const isVideo = component.type === "video" || component.type === "interactive_video";
    const isBanner = component.type === "banner";
    const isImage = component.type === "image";
    const isLinkUnit =
      component.type === "text_unit" || component.type === "interactive_unit";
    const isButton = component.type === "button";
    const flushBody = isVideo || isBanner || isImage || isLinkUnit;
    /** Edit-mode URL/title field icons next to the type label. */
    const showHeaderMediaControls =
      editable &&
      (isBanner || isVideo || isImage || isLinkUnit || isButton);
    /** Implement-mode open-URL icons on the visual-left actions (no copy for these). */
    const hasImplementOpenUrls =
      isBanner || isVideo || isImage || isLinkUnit || isButton;
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
          {editable && handle && !isPinned && (
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
            {editable && component.type === "question" ? (
              <select
                className="bg-transparent outline-none cursor-pointer text-sm font-semibold text-surface-700"
                value={component.props.questionType ?? "single_choice"}
                onChange={(e) => {
                  e.stopPropagation();
                  handlePropsChange(component.id, {
                    ...component.props,
                    questionType: e.target.value as QuestionType,
                  });
                }}
                onClick={(e) => e.stopPropagation()}
              >
                {(Object.entries(QUESTION_TYPE_LABEL) as [QuestionType, string][]).map(
                  ([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  )
                )}
              </select>
            ) : component.type === "question" ? (
              QUESTION_TYPE_LABEL[(component.props.questionType as QuestionType) ?? "single_choice"]
            ) : editable && isVideo ? (
              <select
                className="bg-transparent outline-none cursor-pointer text-sm font-semibold text-surface-700"
                value={component.type}
                onChange={(e) => {
                  e.stopPropagation();
                  handleVideoTypeChange(component, e.target.value as ComponentType);
                }}
                onClick={(e) => e.stopPropagation()}
              >
                <option value="video">וידאו</option>
                <option value="interactive_video">וידאו אינטרקטיבי</option>
              </select>
            ) : isVideo ? (
              meta.label
            ) : (
              meta.label
            )}
          </span>
          {isPinned && (
            <span className="text-[10px] font-semibold text-surface-400 bg-surface-100 px-1.5 py-0.5 rounded">
              רכיב זה מוצמד לתחתית העמוד
            </span>
          )}
          {showHeaderMediaControls && (
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
          {editable && isImage && (
            <HeaderFieldPopover
              open={fieldIsOpen("image-image-url")}
              label="קישור לתמונה"
              title="עריכת קישור לתמונה"
              icon={<ThumbnailIcon className="w-4 h-4" />}
              onToggle={() => toggleHeaderField(component.id, "image-image-url")}
              onClose={closeHeaderField}
            >
              <TextField
                dir="ltr"
                autoFocus
                value={component.props.imageUrl ?? ""}
                placeholder="https://... (כתובת תמונה)"
                onChange={(event) =>
                  handlePropsChange(component.id, {
                    ...component.props,
                    imageUrl: event.target.value,
                  })
                }
              />
            </HeaderFieldPopover>
          )}
          {editable && isLinkUnit && (
            <div className="flex items-center gap-1">
              <HeaderFieldPopover
                open={fieldIsOpen("text-unit-image-url")}
                label="קישור לתמונה"
                title="עריכת קישור לתמונה"
                icon={<ThumbnailIcon className="w-4 h-4" />}
                onToggle={() =>
                  toggleHeaderField(component.id, "text-unit-image-url")
                }
                onClose={closeHeaderField}
              >
                <TextField
                  dir="ltr"
                  autoFocus
                  value={component.props.imageUrl ?? ""}
                  placeholder="https://... (כתובת תמונה)"
                  onChange={(event) =>
                    handlePropsChange(component.id, {
                      ...component.props,
                      imageUrl: event.target.value,
                    })
                  }
                />
              </HeaderFieldPopover>
              <HeaderFieldPopover
                open={fieldIsOpen("text-unit-file-url")}
                label="קישור לקובץ"
                title="עריכת קישור לקובץ"
                icon={<LinkIcon className="w-4 h-4" />}
                onToggle={() =>
                  toggleHeaderField(component.id, "text-unit-file-url")
                }
                onClose={closeHeaderField}
              >
                <TextField
                  dir="ltr"
                  autoFocus
                  value={component.props.fileUrl ?? ""}
                  placeholder="https://... (קובץ לפתיחה)"
                  onChange={(event) =>
                    handlePropsChange(component.id, {
                      ...component.props,
                      fileUrl: event.target.value,
                    })
                  }
                />
              </HeaderFieldPopover>
            </div>
          )}
          {editable && isButton && (
            <div className="flex items-center gap-1">
              <HeaderFieldPopover
                open={fieldIsOpen("button-text")}
                label="טקסט הכפתור"
                title="עריכת טקסט הכפתור"
                icon={<PencilIcon className="w-4 h-4" />}
                onToggle={() => toggleHeaderField(component.id, "button-text")}
                onClose={closeHeaderField}
              >
                <TextField
                  autoFocus
                  value={component.props.text ?? ""}
                  placeholder="כפתור"
                  onChange={(event) =>
                    handlePropsChange(component.id, {
                      ...component.props,
                      text: event.target.value,
                    })
                  }
                />
              </HeaderFieldPopover>
              <HeaderFieldPopover
                open={fieldIsOpen("button-align")}
                label="יישור"
                title="עריכת יישור הכפתור"
                icon={<AlignIcon className="w-4 h-4" />}
                onToggle={() => toggleHeaderField(component.id, "button-align")}
                onClose={closeHeaderField}
              >
                <div
                  className="inline-flex w-full rounded border border-surface-200 overflow-hidden"
                  role="group"
                  aria-label="יישור כפתור"
                >
                  {BUTTON_ALIGN_OPTIONS.map((opt) => {
                    const selected =
                      (component.props.align ?? "center") === opt.value;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        className={`flex-1 px-3 h-9 text-sm font-semibold transition-colors duration-fast ${
                          selected
                            ? "bg-surface-900 text-white"
                            : "bg-white text-surface-700 hover:bg-surface-50"
                        }`}
                        aria-pressed={selected}
                        onClick={() =>
                          handlePropsChange(component.id, {
                            ...component.props,
                            align: opt.value,
                          })
                        }
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
              </HeaderFieldPopover>
              <HeaderFieldPopover
                open={fieldIsOpen("button-url")}
                label="קישור"
                title="עריכת קישור הכפתור"
                icon={<LinkIcon className="w-4 h-4" />}
                onToggle={() => toggleHeaderField(component.id, "button-url")}
                onClose={closeHeaderField}
              >
                <TextField
                  dir="ltr"
                  autoFocus
                  value={component.props.url ?? ""}
                  placeholder="https://..."
                  onChange={(event) =>
                    handlePropsChange(component.id, {
                      ...component.props,
                      url: event.target.value,
                    })
                  }
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
            {/* After status in DOM → visual far-left in RTL */}
            {isImplement && hasImplementOpenUrls && (
              <div className="flex items-center gap-1">
                {isBanner && (
                  <HeaderOpenUrlButton
                    url={component.props.imageUrl}
                    label="פתח תמונה"
                    missingLabel="אין קישור לתמונה"
                    icon={<ThumbnailIcon className="w-4 h-4" />}
                  />
                )}
                {isVideo && (
                  <HeaderOpenUrlButton
                    url={component.props.url}
                    label="פתח וידאו"
                    missingLabel="אין קישור לוידאו"
                    icon={<LinkIcon className="w-4 h-4" />}
                  />
                )}
                {isImage && (
                  <HeaderOpenUrlButton
                    url={component.props.imageUrl}
                    label="פתח תמונה"
                    missingLabel="אין קישור לתמונה"
                    icon={<ThumbnailIcon className="w-4 h-4" />}
                  />
                )}
                {isLinkUnit && (
                  <>
                    <HeaderOpenUrlButton
                      url={component.props.imageUrl}
                      label="פתח תמונה"
                      missingLabel="אין קישור לתמונה"
                      icon={<ThumbnailIcon className="w-4 h-4" />}
                    />
                    <HeaderOpenUrlButton
                      url={component.props.fileUrl}
                      label="פתח קובץ"
                      missingLabel="אין קישור לקובץ"
                      icon={<LinkIcon className="w-4 h-4" />}
                    />
                  </>
                )}
                {isButton && (
                  <HeaderOpenUrlButton
                    url={component.props.url}
                    label="פתח קישור"
                    missingLabel="אין קישור לכפתור"
                    icon={<LinkIcon className="w-4 h-4" />}
                  />
                )}
              </div>
            )}
            {isImplement && !hasImplementOpenUrls && (
              <button
                type="button"
                className="relative flex items-center justify-center shrink-0 min-w-[2.75rem] h-7 px-1.5 text-current transition-opacity duration-fast opacity-60 hover:opacity-100"
                title="העתק"
                aria-label={
                  copiedComponentId === component.id ? "הועתק" : "העתק"
                }
                onClick={() =>
                  handleCopy(headerCopyPayload(component), component.id)
                }
              >
                <CopyIcon
                  className={`w-4 h-4 transition-opacity duration-fast ${
                    copiedComponentId === component.id
                      ? "opacity-0"
                      : "opacity-100"
                  }`}
                />
                <span
                  className={`absolute inset-0 flex items-center justify-center text-[11px] font-medium leading-none transition-opacity duration-fast pointer-events-none ${
                    copiedComponentId === component.id
                      ? "opacity-100"
                      : "opacity-0"
                  }`}
                  aria-hidden={copiedComponentId !== component.id}
                >
                  הועתק
                </span>
              </button>
            )}
            {editable && (
              <>
                {!isPinned && (
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
                )}
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
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-1.5 text-3xl font-semibold tracking-tight text-surface-900">
        {isImplement && components !== null && (
          <img
            src={PAGE_TYPE_LOGO[derivePageType(components.map((c) => c.type))]}
            alt=""
            className="w-7 h-7 shrink-0"
          />
        )}
        <div className="flex items-center gap-1.5 min-w-0 flex-1">
          {editable ? (
            <input
              value={page.title}
              placeholder="כותרת העמוד"
              onChange={(e) => handleTitleChange(e.target.value)}
              className="min-w-0 flex-1 bg-transparent outline-none border-b border-transparent transition-colors duration-fast"
            />
          ) : (
            <h1 className="min-w-0 flex-1 truncate">{page.title}</h1>
          )}
          {!isHome && (
            <>
              <LessonFilesButton
                url={lessonFilesFolderUrl}
                compact
                showDisabled
              />
              <LessonVideosButton
                url={lessonVideosFolderUrl}
                compact
                showDisabled
              />
            </>
          )}
        </div>
        {editable && (
          <PageWorkflowStatusToggle
            status={page.workflow_status}
            onSelect={handleSetWorkflowStatus}
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
      {/* Sticky title + status in edit/implement only (not תצוגה) */}
      <div
        className={
          isReview
            ? "mb-3"
            : // Bleed into the start gutter (ps-12) so comment icons scroll under the header.
              "sticky top-0 z-30 -mt-6 -ms-12 mb-3 bg-white pt-6 pb-3 ps-12"
        }
      >
        <BlockComments
          comments={pageComments}
          mode={mode}
          open={openCommentId === PAGE_COMMENTS_OPEN_ID}
          onToggle={() =>
            setOpenCommentId((prev) =>
              prev === PAGE_COMMENTS_OPEN_ID ? null : PAGE_COMMENTS_OPEN_ID
            )
          }
          onAdd={handleAddPageComment}
          onSetResolved={handleSetPageCommentResolved}
          onDelete={handleDeletePageComment}
          ariaLabel="הערות לעמוד"
          className="mb-0"
        >
          {pageHeader}
        </BlockComments>
      </div>

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
            <>
              <SortableList
                items={components.filter((c) => !PINNED_BOTTOM_TYPES.has(c.type))}
                onReorder={(reordered) => {
                  const pinned = components.filter((c) => PINNED_BOTTOM_TYPES.has(c.type));
                  handleReorder([...reordered, ...pinned]);
                }}
                renderItem={(component, handle) => renderComponentCard(component, handle)}
              />
              {components
                .filter((c) => PINNED_BOTTOM_TYPES.has(c.type))
                .map((component) => (
                  <div key={component.id}>{renderComponentCard(component)}</div>
                ))}
            </>
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
            <div className="relative z-0 mt-3 rounded-[16px] border border-dashed border-[#B7D0E8] bg-[#F0F5FA] px-4 pb-5 pt-7">
              <div
                className="pointer-events-none absolute left-1/2 top-0 z-0 flex h-8 w-8 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-[#D4E5F5] text-[#0F6CBF]"
                aria-hidden
              >
                <PlusIcon className="w-4 h-4" />
              </div>

              <div className="flex flex-col gap-5">
                <div>
                  <span className="mb-3 block text-center text-sm font-semibold text-[#1B3A5C]">
                    רכיבי תוכן
                  </span>
                  <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                    {MAIN_COMPONENT_TYPES.map((type) => (
                      <AddComponentTile key={type} type={type} onAdd={handleAdd} />
                    ))}
                  </div>
                </div>

                {!isHome && (
                  <div>
                    <div className="mb-3 flex flex-wrap items-center justify-center gap-x-2 gap-y-1">
                      <span className="text-sm font-semibold text-[#1B3A5C]">פעילויות</span>
                      {components.some((c) => ACTIVITY_TYPES.has(c.type)) && (
                        <span className="inline-flex items-center gap-1 text-xs text-surface-500">
                          <LockIcon className="w-3.5 h-3.5 shrink-0" />
                          כבר יש פעילות בעמוד. ניתן להוסיף רק סוג פעילות אחד בעמוד
                        </span>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                      {ACTIVITY_COMPONENT_TYPES.map((type) => (
                        <AddComponentTile
                          key={type}
                          type={type}
                          disabled={!canAddActivityType(type, components, isHome)}
                          onAdd={handleAdd}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </>
      )}

      {isHome && homeCourseStructure && (
        <div className="mt-8 flex flex-col gap-4">
          {homeCourseStructure.sections.length === 0 ? (
            <p className="text-base text-surface-400">אין עדיין שיעורים בקורס.</p>
          ) : (
            homeCourseStructure.sections.map((section) => (
              <LessonPagesCard
                key={section.id}
                title={section.title}
                pages={homeCourseStructure.pagesBySection.get(section.id) ?? []}
                pageTypes={homeCourseStructure.pageTypes}
                mode={mode}
                onSelectPage={homeCourseStructure.onSelectPage}
                onSelectLesson={() =>
                  homeCourseStructure.onSelectSection(section.id)
                }
                opensAt={section.opens_at}
                resetKey={section.id}
              />
            ))
          )}
        </div>
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
              <span className="min-w-0 truncate">{prevPage.title}</span>
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
              <span className="min-w-0 truncate">{nextPage.title}</span>
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
