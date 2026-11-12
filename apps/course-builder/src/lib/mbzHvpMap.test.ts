import { describe, expect, it } from "vitest";
import { mapHvpActivityToComponents } from "./mbzHvpMap";
import type { MbzActivity, MbzVfs } from "@workspace/mbz-parser";

function activity(cmid: string, xml: string): { vfs: MbzVfs; act: MbzActivity } {
  const path = `activities/hvp_${cmid}/hvp.xml`;
  const vfs: MbzVfs = new Map([[path, new TextEncoder().encode(xml)]]);
  const act: MbzActivity = {
    cmid,
    type: "hvp",
    name: "Test",
    hasGrading: false,
    contentStatus: "pending",
    content: null,
    rawXmlPath: path,
    activityDir: `activities/hvp_${cmid}`,
  };
  return { vfs, act };
}

describe("mapHvpActivityToComponents", () => {
  it("maps Column of TrueFalse to yes_no questions", () => {
    const json = {
      content: [
        {
          content: {
            library: "H5P.TrueFalse 1.8",
            params: {
              question: "<p>Q1?</p>",
              correct: "true",
              l10n: { trueText: "נכון", falseText: "לא" },
            },
          },
        },
        {
          content: {
            library: "H5P.TrueFalse 1.8",
            params: {
              question: "<p>Q2?</p>",
              correct: "false",
              l10n: { trueText: "נכון", falseText: "לא" },
            },
          },
        },
      ],
    };
    const escaped = JSON.stringify(json)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
    const { vfs, act } = activity(
      "1",
      `<activity><hvp><name>T</name><intro></intro><json_content>${escaped}</json_content></hvp></activity>`
    );
    const { components } = mapHvpActivityToComponents(vfs, act);
    const questions = components.filter((c) => c.type === "question");
    expect(questions).toHaveLength(2);
    expect(questions[0]!.props.questionType).toBe("yes_no");
    expect(questions[0]!.props.prompt).toContain("Q1");
    // Must match QuestionBlock YES_NO_OPTIONS ids
    expect(questions[0]!.props.correctOptionId).toBe("__correct");
    expect(questions[1]!.props.correctOptionId).toBe("__incorrect");
  });

  it("maps MultiChoice with one correct answer to single_choice", () => {
    const json = {
      content: [
        {
          content: {
            library: "H5P.MultiChoice 1.16",
            params: {
              question: "<div>Pick</div>",
              answers: [
                { text: "<div>A</div>", correct: false },
                { text: "<div>B</div>", correct: true },
              ],
            },
          },
        },
      ],
    };
    const escaped = JSON.stringify(json)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
    const { vfs, act } = activity(
      "2",
      `<activity><hvp><json_content>${escaped}</json_content></hvp></activity>`
    );
    const { components } = mapHvpActivityToComponents(vfs, act);
    expect(components[0]!.type).toBe("question");
    expect(components[0]!.props.questionType).toBe("single_choice");
    expect(components[0]!.props.options).toHaveLength(2);
    expect(components[0]!.props.correctOptionId).toBeTruthy();
  });
});
