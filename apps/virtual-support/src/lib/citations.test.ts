import { describe, expect, it } from "vitest";
import { splitCitations } from "./citations";

describe("splitCitations", () => {
  it("splits text and citation markers", () => {
    expect(splitCitations("שלב א [1]. שלב ב [1][2].", 2)).toEqual([
      { type: "text", text: "שלב א " },
      { type: "cite", n: 1 },
      { type: "text", text: ". שלב ב " },
      { type: "cite", n: 1 },
      { type: "cite", n: 2 },
      { type: "text", text: "." },
    ]);
  });

  it("drops out-of-range markers and merges the text around them", () => {
    expect(splitCitations("א [3] ב", 2)).toEqual([
      { type: "text", text: "א  ב" },
    ]);
  });

  it("returns plain text when there are no sources", () => {
    expect(splitCitations("אין מידע.", 0)).toEqual([
      { type: "text", text: "אין מידע." },
    ]);
  });
});
