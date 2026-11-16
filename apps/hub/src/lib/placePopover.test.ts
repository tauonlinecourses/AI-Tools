import { describe, expect, it } from "vitest";
import { placePopover } from "./placePopover";

const viewport = { width: 1440, height: 900 };
const size = { width: 400, height: 500 };

describe("placePopover", () => {
  it("opens to the right of the card in LTR when there is room", () => {
    const p = placePopover({ top: 200, left: 100, width: 300, height: 150 }, size, viewport, "ltr");
    expect(p).toEqual({ top: 200, left: 412, side: "end" });
  });

  it("opens to the left of the card in RTL when there is room", () => {
    const p = placePopover({ top: 200, left: 1000, width: 300, height: 150 }, size, viewport, "rtl");
    expect(p).toEqual({ top: 200, left: 588, side: "end" });
  });

  it("flips to the other side near the viewport edge", () => {
    const p = placePopover({ top: 200, left: 1100, width: 300, height: 150 }, size, viewport, "ltr");
    expect(p.side).toBe("start");
    expect(p.left).toBe(1100 - 12 - 400);
  });

  it("keeps the card inside the viewport vertically", () => {
    const p = placePopover({ top: 700, left: 100, width: 300, height: 150 }, size, viewport, "ltr");
    expect(p.top).toBe(900 - 500 - 12);
  });

  it("goes below the card on narrow screens", () => {
    const p = placePopover(
      { top: 100, left: 16, width: 343, height: 150 },
      { width: 351, height: 400 },
      { width: 375, height: 812 },
      "rtl",
    );
    expect(p.side).toBe("below");
    expect(p.top).toBe(262);
  });
});
