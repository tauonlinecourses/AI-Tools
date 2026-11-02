import { describe, expect, it } from "vitest";
import { isInteractiveEmbedSrc, resolveInteractiveEmbedSrc } from "./interactiveEmbed";

describe("isInteractiveEmbedSrc", () => {
  it("detects Genially and Canva hosts", () => {
    expect(isInteractiveEmbedSrc("https://view.genially.com/69dcaa7936e807d4a5c6d199")).toBe(
      true
    );
    expect(
      isInteractiveEmbedSrc("https://www.canva.com/design/DAGabc/view?embed")
    ).toBe(true);
  });

  it("rejects video and Moodle tokens", () => {
    expect(
      isInteractiveEmbedSrc(
        "https://tau.cloud.panopto.eu/Panopto/Pages/Embed.aspx?id=abc"
      )
    ).toBe(false);
    expect(isInteractiveEmbedSrc("$@RESOURCEVIEWBYID*1@$")).toBe(false);
  });
});

describe("resolveInteractiveEmbedSrc", () => {
  it("returns Genially URLs as-is", () => {
    const src = "https://view.genially.com/69dcaa7936e807d4a5c6d199";
    expect(resolveInteractiveEmbedSrc(src)).toBe(src);
  });

  it("adds embed flag to Canva when missing", () => {
    const out = resolveInteractiveEmbedSrc(
      "https://www.canva.com/design/DAGabc/view"
    );
    expect(out).toContain("canva.com");
    expect(out).toMatch(/[?&]embed(?:&|$)/);
  });

  it("returns null for non-embed URLs", () => {
    expect(resolveInteractiveEmbedSrc("https://example.com/doc.pdf")).toBeNull();
  });
});
