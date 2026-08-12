// Multilevel terrain: a "floor" decoration marks a cell as raised one tier.
// These pure helpers turn the raised-cell set into elevated-grass tiles and the
// auto-tiled stone cliff walls, drawn from the SAME 9×6 grass sheet the ground
// grass uses (right block cols 5-8 = highland grass + a 2-course wall; the wall
// hangs into the two rows below a raised cell's exposed south edge).
import { DECORATIONS, type DecorationsMap } from "../components/decorations";

export type ElTile = { x: number; y: number; c: number; r: number };

// Column within the elevated tileset's right block for a cell given which
// horizontal neighbours are OPEN (not raised). The 3-wide blob is cols 5/6/7
// (west/middle/east); col 8 is the standalone 1-wide-vertical variant
// (bordered on both sides). Using col 8 as a plain east edge detaches the
// column — cols 5/6/7 keep a wide platform's interior seamless.
const elevCol = (l: boolean, r: boolean) => (l && r ? 8 : l ? 5 : r ? 7 : 6);

/** Set of "x,y" cells that carry a `floor` decoration (→ raised one tier). */
export function raisedCells(decorations: DecorationsMap): Set<string> {
  const s = new Set<string>();
  for (const [key, stack] of Object.entries(decorations)) {
    if (stack.some((e) => DECORATIONS[e.kind].family === "floor")) s.add(key);
  }
  return s;
}

/**
 * Elevated-grass surface for EVERY raised cell, auto-tiled from the right block.
 * Rows are ONLY 0 (top edge) and 1 (interior/body); columns via {@link elevCol}.
 * We deliberately never use row 2 (scalloped grass *bottom*) or row 3 (the
 * cliff-cap) on the surface: both carry a horizontal border that would seam
 * against the cell above/below. Row 1's top and bottom are clean grass, so
 * stacked rows merge seamlessly into one cohesive platform; the grass→stone
 * transition lives in the cliff tile ({@link wallTiles}) hanging below.
 */
export function elevatedTiles(raised: Set<string>): ElTile[] {
  const isR = (x: number, y: number) => raised.has(`${x},${y}`);
  const out: ElTile[] = [];
  for (const key of raised) {
    const [x, y] = key.split(",").map(Number) as [number, number];
    const t = !isR(x, y - 1);
    const l = !isR(x - 1, y);
    const r = !isR(x + 1, y);
    out.push({ x, y, c: elevCol(l, r), r: t ? 0 : 1 });
  }
  return out;
}

/**
 * The stone cliff face that hangs one tile below a raised cell whose south
 * neighbour is lower. A SINGLE course (row 4) — the grass-to-stone lip lives in
 * the cell's own bottom-cap tile (row 3, from {@link elevatedTiles}), so one
 * wall row reads as a clean 1-tier step (a full 2-course wall's mossy base seams
 * over grass). Column matches the surface via {@link elevCol} (5/6/7 wide,
 * 8 for a 1-wide drop) so the wall lines up under its cell.
 */
export function wallTiles(raised: Set<string>): ElTile[] {
  const isR = (x: number, y: number) => raised.has(`${x},${y}`);
  const out: ElTile[] = [];
  for (const key of raised) {
    const [x, y] = key.split(",").map(Number) as [number, number];
    if (isR(x, y + 1)) continue; // south neighbour also raised → no drop
    const l = !isR(x - 1, y);
    const r = !isR(x + 1, y);
    out.push({ x, y: y + 1, c: elevCol(l, r), r: 4 });
  }
  return out;
}
