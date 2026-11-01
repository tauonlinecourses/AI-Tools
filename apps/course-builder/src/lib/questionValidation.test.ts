import { describe, expect, it } from "vitest";
import type { PageComponent, QuestionProps } from "./types";
import {
  validatePageQuestions,
  validateQuestionProps,
} from "./questionValidation";

function q(partial: QuestionProps): QuestionProps {
  return partial;
}

describe("validateQuestionProps", () => {
  it("requires non-empty options and a correct answer for single choice", () => {
    expect(
      validateQuestionProps(
        q({
          questionType: "single_choice",
          options: [
            { id: "a", text: "" },
            { id: "b", text: "ב" },
          ],
        })
      )
    ).toEqual(["אפשרות 1 ריקה", "לא נבחרה תשובה נכונה"]);

    expect(
      validateQuestionProps(
        q({
          questionType: "single_choice",
          options: [
            { id: "a", text: "א" },
            { id: "b", text: "ב" },
          ],
          correctOptionId: "a",
        })
      )
    ).toEqual([]);
  });

  it("requires at least one correct answer for multiple choice", () => {
    expect(
      validateQuestionProps(
        q({
          questionType: "multiple_choice",
          options: [
            { id: "a", text: "א" },
            { id: "b", text: "ב" },
          ],
          correctOptionId: "",
        })
      )
    ).toEqual(["לא נבחרה תשובה נכונה"]);

    expect(
      validateQuestionProps(
        q({
          questionType: "multiple_choice",
          options: [
            { id: "a", text: "א" },
            { id: "b", text: "ב" },
          ],
          correctOptionId: "a,b",
        })
      )
    ).toEqual([]);
  });

  it("only requires a correct answer for yes/no", () => {
    expect(
      validateQuestionProps(q({ questionType: "yes_no" }))
    ).toEqual(["לא נבחרה תשובה נכונה"]);

    expect(
      validateQuestionProps(
        q({ questionType: "yes_no", correctOptionId: "__correct" })
      )
    ).toEqual([]);
  });
});

describe("validatePageQuestions", () => {
  it("returns null when questions are valid", () => {
    const components: PageComponent[] = [
      {
        id: "1",
        page_id: "p",
        type: "question",
        position: 0,
        props: {
          questionType: "single_choice",
          options: [
            { id: "a", text: "א" },
            { id: "b", text: "ב" },
          ],
          correctOptionId: "a",
        },
        implemented_at: null,
        updated_at: "",
      },
    ];
    expect(validatePageQuestions(components)).toBeNull();
  });

  it("aggregates standalone and interactive-video question issues", () => {
    const components: PageComponent[] = [
      {
        id: "1",
        page_id: "p",
        type: "question",
        position: 0,
        props: {
          questionType: "single_choice",
          options: [
            { id: "a", text: "" },
            { id: "b", text: "ב" },
          ],
          correctOptionId: "b",
        },
        implemented_at: null,
        updated_at: "",
      },
      {
        id: "2",
        page_id: "p",
        type: "interactive_video",
        position: 1,
        props: {
          questions: [
            {
              questionType: "yes_no",
              correctOptionId: undefined,
            },
          ],
        },
        implemented_at: null,
        updated_at: "",
      },
    ];
    const msg = validatePageQuestions(components);
    expect(msg).toContain("לפני סימון העמוד כמוכן להטמעה");
    expect(msg).toContain("שאלה 1: אפשרות 1 ריקה");
    expect(msg).toContain("וידאו אינטרקטיבי — שאלה 1: לא נבחרה תשובה נכונה");
  });
});
