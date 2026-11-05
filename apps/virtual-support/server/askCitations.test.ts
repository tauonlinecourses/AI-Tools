import { describe, expect, it } from "vitest";
import {
  isRefusal,
  normalizeCitations,
  processCitations,
  REFUSAL_SENTENCE,
  stripCitationMarkers,
} from "./askCitations";

describe("normalizeCitations", () => {
  it("expands lists and Hebrew document labels", () => {
    expect(normalizeCitations("שלב א [1, 2]. שלב ב [מסמך 3].")).toBe(
      "שלב א [1][2]. שלב ב [3]."
    );
  });

  it("collapses the context header format", () => {
    expect(normalizeCitations("ראו [מסמך 2: איחוד אתרים (Moodle)].")).toBe(
      "ראו [2]."
    );
  });

  it("leaves non-citation brackets alone", () => {
    expect(normalizeCitations("לחצו על [שמירה] ואז [OK]")).toBe(
      "לחצו על [שמירה] ואז [OK]"
    );
  });
});

describe("processCitations", () => {
  it("renumbers pages by first appearance", () => {
    const r = processCitations("א [3]. ב [1]. ג [3][1].", 3);
    expect(r.text).toBe("א [1]. ב [2]. ג [1][2].");
    expect(r.order).toEqual([3, 1]);
  });

  it("drops markers for pages that were not sent", () => {
    const r = processCitations("א [1]. ב [7]. ג [0].", 2);
    expect(r.text).toBe("א [1]. ב. ג.");
    expect(r.order).toEqual([1]);
  });

  it("dedupes repeated markers", () => {
    expect(processCitations("א [2][2] [2].", 2).text).toBe("א [1].");
  });

  it("returns an empty order when nothing is cited", () => {
    const r = processCitations("תשובה בלי ציטוטים.", 3);
    expect(r.order).toEqual([]);
    expect(r.text).toBe("תשובה בלי ציטוטים.");
  });

  it("keeps step lists and line breaks intact", () => {
    const r = processCitations("1. היכנסו [2]\n2. לחצו שמירה [2]", 2);
    expect(r.text).toBe("1. היכנסו [1]\n2. לחצו שמירה [1]");
  });
});

describe("refusal and history helpers", () => {
  it("detects the refusal sentence even with stray markers", () => {
    expect(isRefusal(REFUSAL_SENTENCE)).toBe(true);
    expect(isRefusal(`${REFUSAL_SENTENCE} [1]`)).toBe(true);
    expect(isRefusal("יש לבצע את השלבים [1].")).toBe(false);
  });

  it("does not treat a partial answer that mentions missing info as a refusal", () => {
    expect(
      isRefusal(
        `1. היכנסו לאתר הקורס [1].\n2. העתיקו את הקישור [1].\n${REFUSAL_SENTENCE}`
      )
    ).toBe(false);
  });

  it("strips markers from history text", () => {
    expect(stripCitationMarkers("א [1]. ב [1, 2].")).toBe("א. ב.");
  });
});
