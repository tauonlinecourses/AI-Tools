import { describe, expect, it, vi } from "vitest";

vi.mock("./supabase", () => ({ supabase: {} }));
vi.mock("./api", () => ({
  getCourseTree: vi.fn(),
  listCommentsForPage: vi.fn(),
  listPageComments: vi.fn(),
  listComponents: vi.fn(),
}));

import { BACKUP_FORMAT, BACKUP_VERSION, parseCourseBackup } from "./courseBackup";

function validBackup() {
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: "2026-01-01T00:00:00.000Z",
    course: { title: "Course", description: null },
    sections: [
      {
        tempKey: "s1",
        title: "Lesson 1",
        position: 0,
        opens_at: null,
        assignments_due_at: null,
        files_folder_url: null,
        videos_folder_url: null,
      },
    ],
    pages: [
      {
        tempKey: "home",
        sectionTempKey: null,
        title: "Home",
        position: 0,
        notes: null,
        workflow_status: "in_progress",
        isHome: true,
      },
      {
        tempKey: "p1",
        sectionTempKey: "s1",
        title: "Page 1",
        position: 0,
        notes: null,
        workflow_status: "ready_for_implementation",
        isHome: false,
      },
    ],
    components: [
      {
        tempKey: "c1",
        pageTempKey: "p1",
        type: "text",
        position: 0,
        props: { html: "<p>x</p>" },
        implemented_at: null,
        updated_at: "2026-01-01T00:00:00.000Z",
      },
    ],
    comments: [
      {
        componentTempKey: "c1",
        author_role: "review",
        body: "Looks good",
        resolved_at: null,
        created_at: "2026-01-01T00:00:00.000Z",
      },
    ],
    pageComments: [
      {
        pageTempKey: "p1",
        author_role: "edit",
        body: "Page note",
        resolved_at: null,
        created_at: "2026-01-01T00:00:00.000Z",
      },
    ],
  };
}

describe("parseCourseBackup", () => {
  it("accepts a valid backup unchanged", () => {
    const raw = validBackup();
    expect(parseCourseBackup(raw)).toEqual(raw);
  });

  it("defaults missing pageComments to an empty array", () => {
    const { pageComments: _ignored, ...legacy } = validBackup();
    expect(parseCourseBackup(legacy).pageComments).toEqual([]);
  });

  it("rejects non-objects and wrong format/version", () => {
    expect(() => parseCourseBackup(null)).toThrow();
    expect(() => parseCourseBackup({ ...validBackup(), format: "other" })).toThrow();
    expect(() => parseCourseBackup({ ...validBackup(), version: 2 })).toThrow();
  });

  it("requires exactly one home page", () => {
    const noHome = validBackup();
    noHome.pages = noHome.pages.filter((p) => !p.isHome);
    expect(() => parseCourseBackup(noHome)).toThrow();

    const twoHomes = validBackup();
    twoHomes.pages.push({ ...twoHomes.pages[0], tempKey: "home2" });
    expect(() => parseCourseBackup(twoHomes)).toThrow();
  });

  it("rejects references to missing parents", () => {
    const orphanPage = validBackup();
    orphanPage.pages[1].sectionTempKey = "missing";
    expect(() => parseCourseBackup(orphanPage)).toThrow();

    const orphanComponent = validBackup();
    orphanComponent.components[0].pageTempKey = "missing";
    expect(() => parseCourseBackup(orphanComponent)).toThrow();

    const orphanComment = validBackup();
    orphanComment.comments[0].componentTempKey = "missing";
    expect(() => parseCourseBackup(orphanComment)).toThrow();
  });

  it("rejects duplicate keys and unknown enum values", () => {
    const dupSection = validBackup();
    dupSection.sections.push({ ...dupSection.sections[0] });
    expect(() => parseCourseBackup(dupSection)).toThrow();

    const badType = validBackup();
    badType.components[0].type = "unknown";
    expect(() => parseCourseBackup(badType)).toThrow();

    const badRole = validBackup();
    badRole.comments[0].author_role = "nobody";
    expect(() => parseCourseBackup(badRole)).toThrow();
  });
});
