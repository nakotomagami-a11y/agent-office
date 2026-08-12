import { describe, expect, it } from "vitest";
import { elevatedTiles, wallTiles } from "./elevation";

const set = (...keys: string[]) => new Set(keys);
const at = (tiles: { x: number; y: number; c: number; r: number }[], x: number, y: number) =>
  tiles.find((t) => t.x === x && t.y === y);

describe("elevatedTiles auto-tile (cols 5/6/7 blob, 8 = 1-wide)", () => {
  it("top row uses row 0, lower rows use clean body row 1 (no seam)", () => {
    const raised = set("0,0", "1,0", "0,1", "1,1");
    const t = elevatedTiles(raised);
    expect(at(t, 0, 0)).toMatchObject({ c: 5, r: 0 }); // top-left edge
    expect(at(t, 1, 0)).toMatchObject({ c: 7, r: 0 }); // top-right edge (col 7)
    expect(at(t, 0, 1)).toMatchObject({ c: 5, r: 1 }); // lower-left → body row 1
    expect(at(t, 1, 1)).toMatchObject({ c: 7, r: 1 }); // lower-right → body row 1
  });

  it("uses the seamless interior tile when all neighbours are raised", () => {
    const raised = set("1,1", "0,1", "2,1", "1,0", "1,2");
    expect(at(elevatedTiles(raised), 1, 1)).toMatchObject({ c: 6, r: 1 });
  });

  it("uses the 1-wide vertical column (8) when both sides are open", () => {
    const raised = set("0,0", "0,1", "0,2"); // 1-wide vertical strip
    expect(at(elevatedTiles(raised), 0, 1)).toMatchObject({ c: 8, r: 1 });
  });
});

describe("wallTiles", () => {
  it("hangs a single 1-wide stone course below an isolated cell", () => {
    const raised = set("0,0");
    const w = wallTiles(raised);
    // isolated cell → both sides open → 1-wide wall column (8), one course only
    expect(at(w, 0, 1)).toMatchObject({ c: 8, r: 4 });
    expect(at(w, 0, 2)).toBeUndefined(); // no second course over grass
  });

  it("draws no wall when the south neighbour is also raised", () => {
    const raised = set("0,0", "0,1");
    expect(at(wallTiles(raised), 0, 1)).toBeUndefined();
  });

  it("matches surface columns at span ends and middle", () => {
    const raised = set("0,0", "1,0", "2,0"); // 3-wide south-exposed strip
    expect(at(wallTiles(raised), 0, 1)).toMatchObject({ c: 5, r: 4 }); // west end
    expect(at(wallTiles(raised), 1, 1)).toMatchObject({ c: 6, r: 4 }); // interior
    expect(at(wallTiles(raised), 2, 1)).toMatchObject({ c: 7, r: 4 }); // east end
  });
});
