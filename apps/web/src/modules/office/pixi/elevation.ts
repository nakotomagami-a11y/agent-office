// Multilevel terrain: a "floor" decoration marks a cell as raised one tier.
// These pure helpers turn the raised-cell set into elevated-grass tiles and the
// auto-tiled stone cliff walls, drawn from the SAME 9×6 grass sheet the ground
// grass uses (right block cols 5-8 = highland grass + a 2-course wall; the wall
// hangs into the two rows below a raised cell's exposed south edge).
import { DECORATIONS, type DecorationKind, type DecorationsMap } from "../components/decorations";
import type { GrassColor } from "../components/grass-colors";

export type ElTile = { x: number; y: number; c: number; r: number; shade?: GrassColor };

// Column within the elevated tileset's right block for a cell given which
// horizontal neighbours are OPEN (not raised, and not covered by a ramp — see
// {@link RampCoverage}). The 3-wide blob is cols 5/6/7 (west/middle/east);
// col 8 is the standalone 1-wide-vertical variant (bordered on both sides).
// Using col 8 as a plain east edge detaches the column — cols 5/6/7 keep a
// wide platform's interior seamless.
const elevCol = (l: boolean, r: boolean) => (l && r ? 8 : l ? 5 : r ? 7 : 6);

/** Set of "x,y" cells that carry a `floor` decoration (→ raised one tier). */
export function raisedCells(decorations: DecorationsMap): Set<string> {
  const s = new Set<string>();
  for (const [key, stack] of Object.entries(decorations)) {
    if (stack.some((e) => DECORATIONS[e.kind].family === "floor")) s.add(key);
  }
  return s;
}

/** "x,y" → the `floor` tile's biome override, for raised cells that were
 *  stamped by the fill tool's cluster flood-fill (see {@link floodFillRaised}
 *  in `apply-cell-click.ts`). Cells with no override follow the map's global
 *  Island color instead — the render loop's default when this map has no
 *  entry for a key. */
export function floorShades(decorations: DecorationsMap): Map<string, GrassColor> {
  const m = new Map<string, GrassColor>();
  for (const [key, stack] of Object.entries(decorations)) {
    const floor = stack.find((e) => DECORATIONS[e.kind].family === "floor");
    if (floor?.shade) m.set(key, floor.shade);
  }
  return m;
}

/**
 * Every raised cell reachable from `(startX, startY)` by 4-directional
 * adjacency through the `raised` set — i.e. "the platform this cell belongs
 * to." Powers the fill tool: clicking a raised cell shades this whole
 * cluster instead of the single tile. Empty when the start cell isn't raised
 * (same no-op-on-invalid-start shape as the water `floodFill` in
 * `derive/office-scene-data.ts`).
 */
export function floodFillRaised(raised: Set<string>, startX: number, startY: number): string[] {
  const startKey = `${startX},${startY}`;
  if (!raised.has(startKey)) return [];
  const visited = new Set<string>([startKey]);
  const out: string[] = [startKey];
  const queue: [number, number][] = [[startX, startY]];
  let head = 0;
  while (head < queue.length) {
    const [x, y] = queue[head++]!;
    for (const [nx, ny] of [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]] as const) {
      const key = `${nx},${ny}`;
      if (visited.has(key) || !raised.has(key)) continue;
      visited.add(key);
      out.push(key);
      queue.push([nx, ny]);
    }
  }
  return out;
}

/** "x,y" cells that carry the given ramp kind. */
function rampCells(decorations: DecorationsMap, kind: DecorationKind): Set<string> {
  const s = new Set<string>();
  for (const [key, stack] of Object.entries(decorations)) {
    if (stack.some((e) => e.kind === kind)) s.add(key);
  }
  return s;
}

/**
 * A ramp supplies its own grass→stone transition art, so the wall column it
 * butts against must NOT also draw the auto-tiled edge fringe on that side —
 * two fringes back to back reads as a harsh seam (this is the "ramp doesn't
 * connect nicely with the wall" bug). `west`/`east` are the *platform* cells
 * (same key `elevatedTiles`/`wallTiles` iterate) whose wall should suppress
 * its west/east fringe because a ramp is attached one row below on that side.
 */
export type RampCoverage = { west: Set<string>; east: Set<string> };

export function rampCoverage(decorations: DecorationsMap): RampCoverage {
  const west = new Set<string>();
  const east = new Set<string>();
  // ramp_left sits one row below-and-west of the platform cell that owns the
  // wall it's flush against (rampValid: ramp_left requires a wall to its
  // east); ramp_right mirrors it on the other side.
  for (const key of rampCells(decorations, "ramp_left")) {
    const [x, y] = key.split(",").map(Number) as [number, number];
    west.add(`${x + 1},${y - 1}`);
  }
  for (const key of rampCells(decorations, "ramp_right")) {
    const [x, y] = key.split(",").map(Number) as [number, number];
    east.add(`${x - 1},${y - 1}`);
  }
  return { west, east };
}

const NO_RAMPS: RampCoverage = { west: new Set(), east: new Set() };

/**
 * Elevated-grass surface for EVERY raised cell, auto-tiled from the right block.
 * Row picks the correct edge cap via {@link elevRow}; columns via
 * {@link elevCol}. Row 1 (interior/body) is clean grass top and bottom, so
 * unexposed cells merge seamlessly into one cohesive platform; exposed edges
 * pick up the matching scalloped cap (row 0 top / row 2 bottom / row 3 both)
 * so the grass blends straight into the cliff tile ({@link wallTiles})
 * hanging below instead of stopping in a hard flat line.
 */
function elevRow(t: boolean, b: boolean): number {
  return t && b ? 3 : t ? 0 : b ? 2 : 1;
}

const NO_SHADES: Map<string, GrassColor> = new Map();

export function elevatedTiles(
  raised: Set<string>,
  ramps: RampCoverage = NO_RAMPS,
  shades: Map<string, GrassColor> = NO_SHADES,
): ElTile[] {
  const isR = (x: number, y: number) => raised.has(`${x},${y}`);
  const out: ElTile[] = [];
  for (const key of raised) {
    const [x, y] = key.split(",").map(Number) as [number, number];
    const t = !isR(x, y - 1);
    const b = !isR(x, y + 1);
    const l = !isR(x - 1, y) && !ramps.west.has(key);
    const r = !isR(x + 1, y) && !ramps.east.has(key);
    out.push({ x, y, c: elevCol(l, r), r: elevRow(t, b), shade: shades.get(key) });
  }
  return out;
}

/**
 * The stone cliff face that hangs one tile below a raised cell whose south
 * neighbour is lower. A SINGLE course (row 4) — the grass-to-stone lip lives in
 * the cell's own bottom-cap tile (row 2, or row 3 if it's also a top edge, from
 * {@link elevatedTiles}'s {@link elevRow}), so one wall row reads as a clean
 * 1-tier step (a full 2-course wall's mossy base seams over grass). Column
 * matches the surface via {@link elevCol} (5/6/7 wide, 8 for a 1-wide drop) so
 * the wall lines up under its cell — including the ramp fringe suppression
 * from {@link RampCoverage}, so a ramp-adjacent wall stays column-aligned
 * with the (also suppressed) grass cap above it. Also inherits the owning
 * cell's {@link floorShades} override, so a shaded platform's cliff reads
 * from that SAME biome sheet — required, not cosmetic: the cap tile
 * ({@link elevatedTiles}) and the wall tile below it must come from one
 * sheet or the blend seam the two rows are built to share breaks again.
 */
export function wallTiles(
  raised: Set<string>,
  ramps: RampCoverage = NO_RAMPS,
  shades: Map<string, GrassColor> = NO_SHADES,
): ElTile[] {
  const isR = (x: number, y: number) => raised.has(`${x},${y}`);
  const out: ElTile[] = [];
  for (const key of raised) {
    const [x, y] = key.split(",").map(Number) as [number, number];
    if (isR(x, y + 1)) continue; // south neighbour also raised → no drop
    const l = !isR(x - 1, y) && !ramps.west.has(key);
    const r = !isR(x + 1, y) && !ramps.east.has(key);
    out.push({ x, y: y + 1, c: elevCol(l, r), r: 4, shade: shades.get(key) });
  }
  return out;
}
