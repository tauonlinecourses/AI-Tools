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
}

/** Course-level default page that sits above the first lesson in the sidebar. */
export function isHomePage(page: Page): boolean {
  return page.section_id === null;
}

export type ComponentType = "banner" | "video" | "text" | "question";

/** URL-driven course shell mode: authoring, implementer, or polished preview. */
export type CourseViewMode = "edit" | "implement" | "review";

export interface BannerProps {
  title?: string;
  imageUrl?: string;
}

export interface VideoProps {
  /** Custom display name; empty → default `{page title} | סרטון מספר N`. */
  title?: string;
  url?: string;
  provider?: "youtube" | "panopto" | "other";
}

export interface TextProps {
  markdown?: string;
}

export interface QuestionOption {
  id: string;
  text: string;
}

export interface QuestionProps {
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
