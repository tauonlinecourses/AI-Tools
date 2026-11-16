export interface Rect {
  top:    number;
  left:   number;
  width:  number;
  height: number;
}

export interface Placement {
  top:  number;
  left: number;
  side: "start" | "end" | "below" | "above";
}

const GAP = 12;
const MARGIN = 12;

/**
 * Position a floating card next to `anchor`, in viewport coordinates.
 * Prefers the side that follows reading direction (right in LTR, left in RTL),
 * then the opposite side, then below / above. Always clamped inside the viewport.
 */
export function placePopover(
  anchor: Rect,
  size: { width: number; height: number },
  viewport: { width: number; height: number },
  dir: "ltr" | "rtl",
): Placement {
  const clampTop = (top: number) =>
    Math.max(MARGIN, Math.min(top, viewport.height - size.height - MARGIN));
  const clampLeft = (left: number) =>
    Math.max(MARGIN, Math.min(left, viewport.width - size.width - MARGIN));

  const rightLeft = anchor.left + anchor.width + GAP;
  const leftLeft = anchor.left - GAP - size.width;
  const fitsRight = rightLeft + size.width <= viewport.width - MARGIN;
  const fitsLeft = leftLeft >= MARGIN;

  const sides =
    dir === "rtl"
      ? [
          { fits: fitsLeft, left: leftLeft },
          { fits: fitsRight, left: rightLeft },
        ]
      : [
          { fits: fitsRight, left: rightLeft },
          { fits: fitsLeft, left: leftLeft },
        ];

  for (const [i, s] of sides.entries()) {
    if (s.fits) {
      return { top: clampTop(anchor.top), left: s.left, side: i === 0 ? "end" : "start" };
    }
  }

  // No room beside the card (narrow screens): go below, else above.
  const centered = clampLeft(anchor.left + anchor.width / 2 - size.width / 2);
  const belowTop = anchor.top + anchor.height + GAP;
  if (belowTop + size.height <= viewport.height - MARGIN) {
    return { top: belowTop, left: centered, side: "below" };
  }
  const aboveTop = anchor.top - GAP - size.height;
  if (aboveTop >= MARGIN) {
    return { top: aboveTop, left: centered, side: "above" };
  }
  return { top: clampTop(belowTop), left: centered, side: "below" };
}
