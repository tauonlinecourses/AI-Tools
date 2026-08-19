export interface Course {
  id: string;
  title: string;
  description: string | null;
  created_at: string;
  updated_at: string;
}

export interface Section {
  id: string;
  course_id: string;
  title: string;
  position: number;
  /** תאריך פתיחה (YYYY-MM-DD) */
  opens_at: string | null;
  /** תאריך אחרון להגשת מטלות/תרגילים (YYYY-MM-DD) */
  assignments_due_at: string | null;
  /** לינק לתיקיית קבצים של השיעור */
  files_folder_url: string | null;
}

export interface Page {
  id: string;
  /** Set for lesson pages; null for the course home page ("עמוד ראשי"). */
  section_id: string | null;
  /** Set for the course home page; null for lesson pages. */
  course_id: string | null;
  title: string;
  position: number;
  notes: string | null;
  /** Authoring readiness. In-progress pages are unavailable in implement mode. */
  workflow_status: PageWorkflowStatus;
}

export type PageWorkflowStatus = "in_progress" | "ready_for_implementation";

/** Course-level default page that sits above the first lesson in the sidebar. */
export function isHomePage(page: Page): boolean {
  return page.section_id === null;
}

export type ComponentType = "banner" | "video" | "interactive_video" | "text" | "question" | "image" | "notes_board" | "word_cloud";

/** Activity component types — only one kind allowed per page. */
export const ACTIVITY_TYPES: ReadonlySet<ComponentType> = new Set(["question", "notes_board", "word_cloud"]);

/** Component types that are always pinned to the bottom of the page. */
export const PINNED_BOTTOM_TYPES: ReadonlySet<ComponentType> = new Set(["notes_board", "word_cloud"]);

/**
 * Moodle/edX activity shape implied by a page's blocks.
 * Each activity type gets its own logo and label.
 */
export type PageType = "page" | "h5p" | "notes_board" | "word_cloud";

export const PAGE_TYPE_LOGO: Record<PageType, string> = {
  page: "/page-logo.svg",
  h5p: "/h5p-logo.svg",
  notes_board: "/notes-board-logo.svg",
  word_cloud: "/cloud-words-logo.svg",
};

export const PAGE_TYPE_LABEL: Record<PageType, string> = {
  page: "עמוד",
  h5p: "H5P",
  notes_board: "לוח פתקים",
  word_cloud: "ענן מילים",
};

/** Derive implementer page type from the component types on that page. */
export function derivePageType(types: Iterable<ComponentType>): PageType {
  for (const t of types) {
    if (t === "notes_board") return "notes_board";
    if (t === "word_cloud") return "word_cloud";
    if (t === "question" || t === "interactive_video") return "h5p";
  }
  return "page";
}

/** URL-driven course shell mode: authoring, implementer, or polished preview. */
export type CourseViewMode = "edit" | "implement" | "review";

/** Implementer notes — shared by banner, video, and question (not text). */
export interface NotesProps {
  notes?: string;
}

export interface BannerProps extends NotesProps {
  /** Legacy custom name; UI always shows the derived default label instead. */
  title?: string;
  imageUrl?: string;
}

export interface VideoProps extends NotesProps {
  /** Custom display name; empty → default `{page title} | סרטון מספר N`. */
  title?: string;
  url?: string;
  /**
   * Derived from `url` on edit (`detectVideoProvider`); not shown in the UI.
   * Kept for stored jsonb / older rows.
   */
  provider?: "youtube" | "panopto" | "other";
}

export interface InteractiveVideoProps extends VideoProps {
  /** Embedded questions for interactive video. */
  questions?: QuestionProps[];
}

export interface TextProps {
  /** Sanitized rich-text HTML from the TipTap editor. */
  html?: string;
  /** Legacy plain-text body; migrated to `html` on next edit/save. */
  markdown?: string;
}

export interface QuestionOption {
  id: string;
  text: string;
}

export type QuestionType = "single_choice" | "multiple_choice" | "yes_no";

export const QUESTION_TYPE_LABEL: Record<QuestionType, string> = {
  single_choice: "שאלת חד-ברירה",
  multiple_choice: "שאלת רב-ברירה",
  yes_no: "שאלת נכון/לא נכון",
};

export interface QuestionProps extends NotesProps {
  questionType?: QuestionType;
  prompt?: string;
  options?: QuestionOption[];
  correctOptionId?: string;
  /** Timestamp (MM:SS) when this question appears in an interactive video. */
  timestamp?: string;
}

export interface NotesBoardColumn {
  id: string;
  title: string;
  items: string[];
}

export interface NotesBoardProps extends NotesProps {
  description?: string;
  columns?: NotesBoardColumn[];
}

export interface WordCloudProps extends NotesProps {
  centerWord?: string;
}

export interface ImageProps extends NotesProps {
  /** URL of the image to display in the placeholder. */
  imageUrl?: string;
  /** URL opened when the thumbnail image is clicked. */
  fileUrl?: string;
}

export type BlockProps = BannerProps & VideoProps & InteractiveVideoProps & TextProps & QuestionProps & ImageProps & NotesBoardProps & WordCloudProps;

export interface PageComponent {
  id: string;
  page_id: string;
  type: ComponentType;
  position: number;
  props: BlockProps;
  implemented_at: string | null;
  updated_at: string;
}

export type ImplementationStatus =
  | "not_implemented"
  | "needs_update"
  | "implemented";

/** Same derivation as the `component_status` DB view — kept client-side to avoid extra queries. */
export function componentStatus(c: PageComponent): ImplementationStatus {
  if (!c.implemented_at) return "not_implemented";
  return new Date(c.implemented_at) < new Date(c.updated_at)
    ? "needs_update"
    : "implemented";
}

export interface StatusRollup {
  implemented_count: number;
  needs_update_count: number;
  not_implemented_count: number;
  total_count: number;
}

export interface CourseTree {
  course: Course;
  sections: Section[];
  pages: Page[];
}

export interface CourseListItem extends Course {
  sectionCount: number;
  pageCount: number;
}

/** View role that authored a block comment (no personal names — MVP has no auth). */
export type CommentAuthorRole = CourseViewMode;

export interface ComponentComment {
  id: string;
  component_id: string;
  author_role: CommentAuthorRole;
  body: string;
  resolved_at: string | null;
  created_at: string;
}

export const COMMENT_AUTHOR_LABEL: Record<CommentAuthorRole, string> = {
  edit: "צוות פיתוח למידה",
  implement: "צוות הטמעה",
  review: "צוות מרצים",
};

/** Text color classes for comment author role labels. */
export const COMMENT_AUTHOR_COLOR: Record<CommentAuthorRole, string> = {
  edit: "text-[#0F6CBF]",
  implement: "text-amber-700",
  review: "text-emerald-700",
};
