"use client";

import { useNineSlicePainter, type NineSliceConfig } from "./nine-slice";

/**
 * JavaScript nine-slice for parchment-style panel backgrounds, driven by the
 * Tiny Swords "SpecialPaper" sprite (`/ui/special-paper.png`): a JS
 * nine-slice where gold-flourished corners and edges stay a fixed pixel
 * thickness while the plain slate middle repeats/fills the rest. Targets
 * any `.paper-panel` element; the element's own `border-radius` still clips
 * the painted background, so rounded panels stay rounded.
 */

const CONFIG: NineSliceConfig = {
  src: "/ui/special-paper.png",
  selector: ".paper-panel",
  // Source rects (device-independent px) measured from the 320x320 sprite:
  // columns 9-63 / 128-191 / 256-310, rows 20-63 / 128-191 / 256-298.
  rects: {
    leftX: 9,
    midX: 128,
    rightX: 256,
    edgeW: 55,
    midW: 64,
    topY: 20,
    topH: 44,
    midY: 128,
    midH: 64,
    botY: 256,
    botH: 43,
  },
  // Fixed fraction of source size for the corner/edge caps, independent of
  // panel size, so the gold flourish reads the same at any panel height.
  capScale: 1,
};

export function PaperPanelPainter() {
  useNineSlicePainter(CONFIG);
  return null;
}
