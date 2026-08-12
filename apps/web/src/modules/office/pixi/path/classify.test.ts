import { describe, expect, it } from "vitest";
import { PATH_MATERIALS } from "./materials";
import { classifyPathPixel, TILE, type Neighborhood } from "./classify";

const cfg = PATH_MATERIALS.dirt;
const ALL: Neighborhood = { n: true, e: true, s: true, w: true, ne: true, nw: true, se: true, sw: true };
const NONE: Neighborhood = { n: false, e: false, s: false, w: false, ne: false, nw: false, se: false, sw: false };

const alpha = (p: [number, number, number, number]) => p[3];

/** Count pixels that are opaque *dirt surface* (tan: r>g), excluding green
 *  tufts and transparent grass — a proxy for how much path the tile shows. */
function dirtCoverage(hood: Neighborhood): number {
  let n = 0;
  for (let ly = 0; ly < TILE; ly++) {
    for (let lx = 0; lx < TILE; lx++) {
      const [r, g, , a] = classifyPathPixel(cfg, hood, 5, 5, lx, ly);
      if (a === 255 && r > g) n++;
    }
  }
  return n;
}

describe("path classifier", () => {
  it("is deterministic for the same input", () => {
    const a = classifyPathPixel(cfg, ALL, 3, 4, 10, 20);
    const b = classifyPathPixel(cfg, ALL, 3, 4, 10, 20);
    expect(a).toEqual(b);
  });

  it("fills the interior when fully surrounded by path", () => {
    const p = classifyPathPixel(cfg, ALL, 5, 5, 32, 32);
    expect(alpha(p)).toBe(255);
    expect(p[0]).toBeGreaterThan(p[1]); // tan dirt, not green
  });

  it("dirt coverage grows with connectivity (isolated < link < surrounded)", () => {
    // Open edges get eaten by grass, so a more-connected cell shows more dirt.
    const EW: Neighborhood = { ...NONE, e: true, w: true };
    const none = dirtCoverage(NONE);
    const link = dirtCoverage(EW);
    const all = dirtCoverage(ALL);
    expect(none).toBeGreaterThan(0);
    expect(link).toBeGreaterThan(none);
    expect(all).toBeGreaterThan(link);
    expect(all).toBe(TILE * TILE); // fully surrounded → all dirt
  });

  it("is seam-consistent: opaque coverage matches across a shared edge", () => {
    // Cell A(0,0) links East to B(1,0). World-space field ⇒ the two tiles agree
    // on the boundary along their shared edge, so the opaque coverage of A's
    // right column and B's left column matches within a sub-pixel tolerance.
    const A: Neighborhood = { ...NONE, e: true };
    const B: Neighborhood = { ...NONE, w: true };
    let aOpaque = 0;
    let bOpaque = 0;
    for (let ly = 0; ly < TILE; ly++) {
      if (alpha(classifyPathPixel(cfg, A, 0, 0, TILE - 1, ly)) > 0) aOpaque++;
      if (alpha(classifyPathPixel(cfg, B, 1, 0, 0, ly)) > 0) bOpaque++;
    }
    expect(Math.abs(aOpaque - bOpaque)).toBeLessThanOrEqual(2);
  });
});
