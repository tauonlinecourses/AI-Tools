import { describe, expect, it } from "vitest";
import {
  describeTemplateTypes,
  isPickerType,
  pickerTypeOf,
  templateLockReason,
  templateTypesFromPage,
  type ComponentTemplate,
} from "./componentCatalog";
import type { BlockProps, ComponentType, PageComponent } from "./types";

function block(type: ComponentType, position: number, props: BlockProps = {}): PageComponent {
  return {
    id: `c${position}`,
    page_id: "p1",
    type,
    position,
    props,
    implemented_at: null,
    updated_at: "2026-01-01T00:00:00Z",
  };
}

describe("templateTypesFromPage", () => {
  it("keeps page order by position, not array order", () => {
    const page = [block("button", 2), block("text", 0), block("video", 1)];
    expect(templateTypesFromPage(page)).toEqual(["text", "video", "button"]);
  });

  it("keeps each question's kind", () => {
    const page = [
      block("question", 0, { questionType: "multiple_choice" }),
      block("question", 1, { questionType: "yes_no" }),
      block("question", 2, { questionType: "single_choice" }),
    ];
    expect(templateTypesFromPage(page)).toEqual([
      "question_multiple",
      "question_yes_no",
      "question_single",
    ]);
  });

  it("falls back to single choice for a question with no kind", () => {
    expect(pickerTypeOf(block("question", 0))).toBe("question_single");
  });

  it("returns an empty layout for an empty page", () => {
    expect(templateTypesFromPage([])).toEqual([]);
  });

  it("leaves banners out (new pages get one automatically)", () => {
    const page = [block("banner", 0), block("text", 1), block("banner", 2), block("video", 3)];
    expect(templateTypesFromPage(page)).toEqual(["text", "video"]);
    expect(templateTypesFromPage([block("banner", 0)])).toEqual([]);
  });
});

describe("describeTemplateTypes", () => {
  it("joins labels and collapses repeated neighbours", () => {
    expect(describeTemplateTypes(["video", "question_single", "question_yes_no"])).toBe(
      "וידאו · 2 × שאלה"
    );
    expect(describeTemplateTypes(["text", "image", "text"])).toBe("טקסט · תמונה · טקסט");
  });
});

describe("isPickerType", () => {
  it("accepts catalog items and rejects anything else", () => {
    expect(isPickerType("question_yes_no")).toBe(true);
    expect(isPickerType("question")).toBe(false);
    expect(isPickerType("removed_block")).toBe(false);
    expect(isPickerType(42)).toBe(false);
  });
});

describe("templateLockReason on a saved template", () => {
  const saved: ComponentTemplate = {
    id: "u1",
    label: "שלי",
    description: "",
    types: templateTypesFromPage([block("text", 0), block("forum", 1)]),
    source: "user",
  };

  it("can be added to an empty lesson page", () => {
    expect(templateLockReason(saved, [], false)).toBeNull();
  });

  it("is blocked on the home page (it has an activity)", () => {
    expect(templateLockReason(saved, [], true)).not.toBeNull();
  });

  it("is blocked when the page already has another activity kind", () => {
    expect(templateLockReason(saved, [block("word_cloud", 0)], false)).not.toBeNull();
  });
});
