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

export type ComponentType = "banner" | "video" | "text" | "question";

/**
 * Moodle/edX activity shape implied by a page's blocks.
 * Today: any question → h5p; otherwise a normal page (text/banner/video/empty).
 * Extra logos in `public/` (task, forum, notes-board, dictionary) await future block types.
 */
export type PageType = "page" | "h5p";

export const PAGE_TYPE_LOGO: Record<PageType, string> = {
  page: "/page-logo.svg",
  h5p: "/h5p-logo.svg",
};

export const PAGE_TYPE_LABEL: Record<PageType, string> = {
  page: "עמוד",
  h5p: "H5P",
};

/** Derive implementer page type from the component types on that page. */
export function derivePageType(types: Iterable<ComponentType>): PageType {
  for (const t of types) {
    if (t === "question") return "h5p";
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

export interface QuestionProps extends NotesProps {
  questionType?: "single_choice";
  prompt?: string;
  options?: QuestionOption[];
  correctOptionId?: string;
}

export type BlockProps = BannerProps & VideoProps & TextProps & QuestionProps;

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
