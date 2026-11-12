import { describe, expect, it } from "vitest";
import {
  normalizeColor,
  normalizeLegacyColorMarkup,
  sanitizeInlineStyle,
} from "./textHtml";

describe("normalizeColor / sanitizeInlineStyle", () => {
  it("accepts hex outside the toolbar palette", () => {
    expect(normalizeColor("#ce2222")).toBe("#ce2222");
    expect(sanitizeInlineStyle("color: #ce2222; font-size: 18px")).toBe(
      "color: #ce2222"
    );
  });

  it("accepts rgb and named colors", () => {
    expect(normalizeColor("rgb(206, 34, 34)")).toBe("#ce2222");
    expect(normalizeColor("navy")).toBe("#000080");
  });
});

describe("normalizeLegacyColorMarkup", () => {
  it("converts legacy font color markup to span style", () => {
    const out = normalizeLegacyColorMarkup(`<p><font color="red">אדום</font></p>`);
    expect(out.toLowerCase()).toContain("color: #ff0000");
    expect(out).toContain("אדום");
    expect(out.toLowerCase()).not.toContain("<font");
  });

  it("leaves hyperlink anchors intact", () => {
    const html = `<p>קראו את <a href="https://example.com/guide" target="_blank">המדריך</a>.</p>`;
    expect(normalizeLegacyColorMarkup(html)).toContain('href="https://example.com/guide"');
  });
});
