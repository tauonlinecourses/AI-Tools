import { describe, expect, it } from "vitest";
import {
  computeCourseOverviewStats,
  roundAvg,
} from "./courseOverviewStats";
import type { Page, Section, StatusRollup } from "./types";

function section(id: string, position = 0): Section {
  return {
    id,
    course_id: "c1",
    title: `Lesson ${id}`,
    position,
    opens_at: null,
    assignments_due_at: null,
    files_folder_url: null,
  };
}

function page(
  partial: Pick<Page, "id" | "section_id" | "course_id" | "workflow_status"> &
    Partial<Page>
): Page {
  return {
    title: partial.id,
    position: 0,
    notes: null,
    ...partial,
  };
}

function rollup(
  implemented: number,
  needsUpdate: number,
  notImplemented: number
): StatusRollup {
  return {
    implemented_count: implemented,
    needs_update_count: needsUpdate,
    not_implemented_count: notImplemented,
    total_count: implemented + needsUpdate + notImplemented,
  };
}

describe("roundAvg", () => {
  it("rounds to one decimal", () => {
    expect(roundAvg(2.333)).toBe(2.3);
    expect(roundAvg(2.35)).toBe(2.4);
    expect(roundAvg(0)).toBe(0);
  });
});

describe("computeCourseOverviewStats", () => {
  it("returns zeros for an empty course", () => {
    const stats = computeCourseOverviewStats({
      sections: [],
      pages: [],
      componentRows: [],
      perPageRollups: new Map(),
    });
    expect(stats.lessonCount).toBe(0);
    expect(stats.pageCount).toBe(0);
    expect(stats.componentCount).toBe(0);
    expect(stats.avgPagesPerLesson).toBe(0);
    expect(stats.avgComponentsPerPage).toBe(0);
    expect(stats.pageTypeCounts.page).toBe(0);
    expect(stats.workflowCounts.in_progress).toBe(0);
    expect(stats.implementRollup.total_count).toBe(0);
  });

  it("ignores home page in pageCount and page-type / workflow tallies", () => {
    const stats = computeCourseOverviewStats({
      sections: [],
      pages: [
        page({
          id: "home",
          section_id: null,
          course_id: "c1",
          workflow_status: "in_progress",
        }),
      ],
      componentRows: [{ page_id: "home", type: "banner" }],
      perPageRollups: new Map([["home", rollup(1, 0, 0)]]),
    });
    expect(stats.lessonCount).toBe(0);
    expect(stats.pageCount).toBe(0);
    expect(stats.componentCount).toBe(1);
    expect(stats.avgComponentsPerPage).toBe(1);
    expect(stats.pageTypeCounts.page).toBe(0);
    expect(stats.workflowCounts.in_progress).toBe(0);
    expect(stats.implementRollup.implemented_count).toBe(1);
  });

  it("aggregates page types, components, averages, workflow, and rollups", () => {
    const sections = [section("s1", 0), section("s2", 1)];
    const pages = [
      page({
        id: "home",
        section_id: null,
        course_id: "c1",
        workflow_status: "ready_for_implementation",
      }),
      page({
        id: "p1",
        section_id: "s1",
        course_id: null,
        workflow_status: "ready_for_implementation",
      }),
      page({
        id: "p2",
        section_id: "s1",
        course_id: null,
        workflow_status: "in_progress",
      }),
      page({
        id: "p3",
        section_id: "s2",
        course_id: null,
        workflow_status: "ready_for_implementation",
      }),
    ];
    const componentRows = [
      { page_id: "home", type: "text" as const },
      { page_id: "p1", type: "text" as const },
      { page_id: "p1", type: "video" as const },
      { page_id: "p2", type: "question" as const },
      { page_id: "p3", type: "forum" as const },
    ];
    const perPageRollups = new Map<string, StatusRollup>([
      ["home", rollup(1, 0, 0)],
      ["p1", rollup(1, 1, 0)],
      ["p2", rollup(0, 0, 1)],
      ["p3", rollup(0, 0, 1)],
    ]);

    const stats = computeCourseOverviewStats({
      sections,
      pages,
      componentRows,
      perPageRollups,
    });

    expect(stats.lessonCount).toBe(2);
    expect(stats.pageCount).toBe(3);
    expect(stats.componentCount).toBe(5);
    expect(stats.avgPagesPerLesson).toBe(1.5);
    expect(stats.avgComponentsPerPage).toBe(1.3); // 5/4
    expect(stats.pageTypeCounts).toEqual({
      page: 1, // p1
      h5p: 1, // p2 question
      notes_board: 0,
      word_cloud: 0,
      forum: 1, // p3
    });
    expect(stats.componentTypeCounts.text).toBe(2);
    expect(stats.componentTypeCounts.video).toBe(1);
    expect(stats.componentTypeCounts.question).toBe(1);
    expect(stats.componentTypeCounts.forum).toBe(1);
    expect(stats.workflowCounts).toEqual({
      in_progress: 1,
      ready_for_implementation: 2,
    });
    expect(stats.implementRollup).toEqual({
      implemented_count: 2,
      needs_update_count: 1,
      not_implemented_count: 2,
      total_count: 5,
    });
  });
});
