import type {
  ComponentType,
  Page,
  PageType,
  PageWorkflowStatus,
  Section,
  StatusRollup,
} from "./types";
import { derivePageType, isHomePage } from "./types";

export const COMPONENT_TYPE_LABEL: Record<ComponentType, string> = {
  banner: "באנר",
  video: "וידאו",
  interactive_video: "וידאו אינטרקטיבי",
  text: "טקסט",
  question: "שאלה",
  image: "תמונה",
  text_unit: "יחידת טקסט",
  interactive_unit: "יחידה אינטראקטיבית",
  button: "כפתור",
  notes_board: "לוח פתקים",
  word_cloud: "ענן מילים",
  forum: "פורום",
};

export const ALL_PAGE_TYPES: readonly PageType[] = [
  "page",
  "h5p",
  "notes_board",
  "word_cloud",
  "forum",
] as const;

export const ALL_COMPONENT_TYPES: readonly ComponentType[] = [
  "banner",
  "video",
  "interactive_video",
  "text",
  "question",
  "image",
  "text_unit",
  "interactive_unit",
  "button",
  "notes_board",
  "word_cloud",
  "forum",
] as const;

export interface CourseOverviewStats {
  lessonCount: number;
  /** Lesson pages only (excludes course home). */
  pageCount: number;
  componentCount: number;
  /** Average lesson pages per lesson; 0 when there are no lessons. */
  avgPagesPerLesson: number;
  /** Average components per page (all pages including home); 0 when no pages. */
  avgComponentsPerPage: number;
  pageTypeCounts: Record<PageType, number>;
  componentTypeCounts: Record<ComponentType, number>;
  workflowCounts: Record<PageWorkflowStatus, number>;
  implementRollup: StatusRollup;
}

function emptyPageTypeCounts(): Record<PageType, number> {
  return {
    page: 0,
    h5p: 0,
    notes_board: 0,
    word_cloud: 0,
    forum: 0,
  };
}

function emptyComponentTypeCounts(): Record<ComponentType, number> {
  return {
    banner: 0,
    video: 0,
    interactive_video: 0,
    text: 0,
    question: 0,
    image: 0,
    text_unit: 0,
    interactive_unit: 0,
    button: 0,
    notes_board: 0,
    word_cloud: 0,
    forum: 0,
  };
}

function emptyWorkflowCounts(): Record<PageWorkflowStatus, number> {
  return {
    in_progress: 0,
    ready_for_implementation: 0,
  };
}

function emptyRollup(): StatusRollup {
  return {
    implemented_count: 0,
    needs_update_count: 0,
    not_implemented_count: 0,
    total_count: 0,
  };
}

/** Round to one decimal for display-friendly averages. */
export function roundAvg(value: number): number {
  if (!Number.isFinite(value) || value === 0) return 0;
  return Math.round(value * 10) / 10;
}

/**
 * Pure aggregation for the course overview dashboard.
 * `componentRows` should include every component on the given pages.
 * `perPageRollups` may be sparse; missing pages contribute zeros.
 */
export function computeCourseOverviewStats(input: {
  sections: Section[];
  pages: Page[];
  componentRows: Array<{ page_id: string; type: ComponentType }>;
  perPageRollups: Map<string, StatusRollup>;
}): CourseOverviewStats {
  const { sections, pages, componentRows, perPageRollups } = input;

  const lessonCount = sections.length;
  const lessonPages = pages.filter((p) => !isHomePage(p));
  const pageCount = lessonPages.length;

  const typesByPage = new Map<string, ComponentType[]>();
  const componentTypeCounts = emptyComponentTypeCounts();
  for (const row of componentRows) {
    if (row.type in componentTypeCounts) {
      componentTypeCounts[row.type] += 1;
    }
    const list = typesByPage.get(row.page_id) ?? [];
    list.push(row.type);
    typesByPage.set(row.page_id, list);
  }

  const componentCount = componentRows.length;
  const avgPagesPerLesson =
    lessonCount === 0 ? 0 : roundAvg(pageCount / lessonCount);
  const avgComponentsPerPage =
    pages.length === 0 ? 0 : roundAvg(componentCount / pages.length);

  const pageTypeCounts = emptyPageTypeCounts();
  // Count page types for lesson pages only (home is structural, not an activity).
  for (const page of lessonPages) {
    const types = typesByPage.get(page.id) ?? [];
    pageTypeCounts[derivePageType(types)] += 1;
  }

  const workflowCounts = emptyWorkflowCounts();
  for (const page of lessonPages) {
    workflowCounts[page.workflow_status] += 1;
  }

  const implementRollup = emptyRollup();
  for (const page of pages) {
    const rollup = perPageRollups.get(page.id);
    if (!rollup) continue;
    implementRollup.implemented_count += rollup.implemented_count;
    implementRollup.needs_update_count += rollup.needs_update_count;
    implementRollup.not_implemented_count += rollup.not_implemented_count;
  }
  implementRollup.total_count =
    implementRollup.implemented_count +
    implementRollup.needs_update_count +
    implementRollup.not_implemented_count;

  return {
    lessonCount,
    pageCount,
    componentCount,
    avgPagesPerLesson,
    avgComponentsPerPage,
    pageTypeCounts,
    componentTypeCounts,
    workflowCounts,
    implementRollup,
  };
}
