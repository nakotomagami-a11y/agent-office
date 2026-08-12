"use client";

import { memo } from "react";
import {
  DECORATIONS,
  bridgeGapValid,
  buildingOccupancy,
  decorationKey,
  footprintCells,
  hasBridgeCap,
  isPlacementValid,
  isStackable,
  type DecorationsMap,
} from "./decorations";
import type { BuildTool } from "./office-build-toolbar";
import { type DragRef } from "../hooks/use-office-drag";

/** A placed agent: its identity (DragRef) plus optional per-instance transforms
 *  edited via the select tool — manual mirror, draw-order bias, pixel nudge. */
export type AgentPlacement = DragRef & {
  flip?: boolean;
  z?: number;
  dx?: number;
  dy?: number;
};

/** "x,y" → placed agent. Sparse - cells with no agent aren't keys. */
export type AgentPositions = Record<string, AgentPlacement>;

/** Inclusive tile-index bounding box for viewport culling. */
export type VisibleRange = {
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
};

/**
 * Grass-island tiling math for the office view. Layout is data-driven: a 2D
 * boolean grid says where grass is, and an auto-tile picker selects the right
 * corner/edge/interior tile for each cell based on its 4 neighbours.
 *
 * `buildTiles` / `buildFoam` turn the grid into draw lists consumed by the
 * PixiJS renderer (office-pixi-canvas); `isToolValidAt` / `GridCell` back the
 * build-mode interaction overlay (office-map-overlay).
 *
 * Tiles are 64-px slices from the active grass tileset (a 9×6 grid). Every
 * color variant shares the exact same layout, so the auto-tile picker doesn't
 * care which one is in use. Coords are 0-indexed into that grid.
 */

export const TILE = 64;
/** Rendered size of a placed-agent sprite (and its drag/hover ghost) in
 *  CSS pixels. The pawn bbox (64×104) scales to this size inside the
 *  square; bigger values let the character extend visibly above the
 *  cell, smaller values shrink it back into the tile. */
export const AGENT_SIZE = 96;

type Coord = { c: number; r: number };
type Quarter = "tl" | "tr" | "bl" | "br";
export type Placed = {
  c: number;
  r: number;
  x: number;
  y: number;
  rotate?: 0 | 90;
  /** When set, render only the named 32×32 quadrant of the tile, anchored
   *  to the same quadrant of the destination cell. Used to assemble an
   *  isolated cell from the four corner tiles' matching quadrants. */
  quarter?: Quarter;
};

const T = {
  // Low-tier 3×3 grass blob (cols 0-2, rows 0-2)
  lt_tl: { c: 0, r: 0 },
  lt_t: { c: 1, r: 0 },
  lt_tr: { c: 2, r: 0 },
  lt_l: { c: 0, r: 1 },
  lt_m: { c: 1, r: 1 },
  lt_r: { c: 2, r: 1 },
  lt_bl: { c: 0, r: 2 },
  lt_b: { c: 1, r: 2 },
  lt_br: { c: 2, r: 2 },

  // 1-wide vertical-column variants (col 3, rows 0-2). Used when a cell has
  // both left AND right empty - i.e. it's a vertical strip of grass with
  // water on both sides. Without these the picker would pick a regular
  // corner tile and one side would render as a hard edge ("cut").
  col_top: { c: 3, r: 0 }, // rims on T + L + R, grass opens down
  col_mid: { c: 3, r: 1 }, // rims on L + R only
  col_bot: { c: 3, r: 2 }, // rims on B + L + R, grass opens up
} satisfies Record<string, Coord>;

/**
 * Pick a grass tile for `(x, y)` from its 4 neighbours' presence.
 * Handles:
 *   - 4 outer corners (2 adjacent sides empty)
 *   - 4 edges (1 side empty)
 *   - Interior (all neighbours present)
 *   - 1-wide vertical column (both left AND right empty) - uses the
 *     column-cap tiles in col 3 of the tileset so 1-wide vertical
 *     protrusions get rims on all three exposed sides instead of just
 *     two.
 *
 * Limitation: 1-wide horizontal protrusions and isolated single tiles
 * still fall through to a corner tile and will look "cut" on one side.
 * The tileset doesn't appear to ship dedicated horizontal-cap tiles in
 * an obvious slot - happy to dig further if you hit those shapes.
 */
type Picked = { tile: Coord; rotate?: 0 | 90; quarter?: Quarter };

/**
 * Returns one or more visual layers for a cell. Most cells render as a
 * single tile; the isolated case (all 4 sides water) stacks two `col_mid`
 * tiles - one unrotated for L+R rims, one rotated 90° for T+B rims after
 * rotation - so all four sides get a proper grass edge.
 */
function pickGrass(grid: boolean[][], x: number, y: number): Picked[] {
  const t = !grid[y - 1]?.[x];
  const b = !grid[y + 1]?.[x];
  const l = !grid[y]?.[x - 1];
  const r = !grid[y]?.[x + 1];

  // Isolated single tile - none of the available tiles has rims on all
  // four sides. Assemble one from the four corner tiles' matching
  // quadrants: TL of lt_tl gives a top+left rim corner, TR of lt_tr a
  // top+right, etc. Stitched together they cover all four edges of the
  // cell with their correct decorative scallops.
  if (t && b && l && r) {
    return [
      { tile: T.lt_tl, quarter: "tl" },
      { tile: T.lt_tr, quarter: "tr" },
      { tile: T.lt_bl, quarter: "bl" },
      { tile: T.lt_br, quarter: "br" },
    ];
  }

  // 1-wide vertical (both left AND right empty, but not isolated).
  if (l && r) {
    if (t) return [{ tile: T.col_top }];
    if (b) return [{ tile: T.col_bot }];
    return [{ tile: T.col_mid }];
  }

  // 1-wide horizontal (both top AND bottom empty). Tileset doesn't ship
  // dedicated horizontal caps; rotate the vertical column variants 90°
  // clockwise: col_top → right-cap, col_bot → left-cap, col_mid →
  // horizontal middle.
  if (t && b) {
    if (l) return [{ tile: T.col_bot, rotate: 90 }];
    if (r) return [{ tile: T.col_top, rotate: 90 }];
    return [{ tile: T.col_mid, rotate: 90 }];
  }

  if (t && l) return [{ tile: T.lt_tl }];
  if (t && r) return [{ tile: T.lt_tr }];
  if (b && l) return [{ tile: T.lt_bl }];
  if (b && r) return [{ tile: T.lt_br }];
  if (t) return [{ tile: T.lt_t }];
  if (b) return [{ tile: T.lt_b }];
  if (l) return [{ tile: T.lt_l }];
  if (r) return [{ tile: T.lt_r }];
  return [{ tile: T.lt_m }];
}

export function buildTiles(grid: boolean[][], range?: VisibleRange): Placed[] {
  const tiles: Placed[] = [];
  const yStart = range ? range.yMin : 0;
  const yEnd = range ? Math.min(range.yMax, grid.length - 1) : grid.length - 1;
  for (let y = yStart; y <= yEnd; y++) {
    const row = grid[y]!;
    const xStart = range ? range.xMin : 0;
    const xEnd = range ? Math.min(range.xMax, row.length - 1) : row.length - 1;
    for (let x = xStart; x <= xEnd; x++) {
      if (!row[x]) continue;
      for (const layer of pickGrass(grid, x, y)) {
        tiles.push({
          x,
          y,
          c: layer.tile.c,
          r: layer.tile.r,
          rotate: layer.rotate,
          quarter: layer.quarter,
        });
      }
    }
  }
  return tiles;
}

/**
 * Cells that should have a foam frame painted behind them: grass cells
 * with at least one off-island neighbour in the 8-cell ring. Diagonals
 * count, so outside corners get foam wrapping their concave side.
 * Expands range by 1 in each direction so foam at range edges is included.
 */
export function buildFoam(grid: boolean[][], range?: VisibleRange): Array<{ x: number; y: number }> {
  const foam: Array<{ x: number; y: number }> = [];
  const present = (x: number, y: number) => grid[y]?.[x] === true;
  // Foam divs are 3×3 tiles centred on the cell; include 1-cell margin
  const yStart = range ? Math.max(0, range.yMin - 1) : 0;
  const yEnd = range ? Math.min(grid.length - 1, range.yMax + 1) : grid.length - 1;
  for (let y = yStart; y <= yEnd; y++) {
    const row = grid[y]!;
    const xStart = range ? Math.max(0, range.xMin - 1) : 0;
    const xEnd = range ? Math.min(row.length - 1, range.xMax + 1) : row.length - 1;
    for (let x = xStart; x <= xEnd; x++) {
      if (!row[x]) continue;
      let edge = false;
      for (let dy = -1; dy <= 1 && !edge; dy++) {
        for (let dx = -1; dx <= 1 && !edge; dx++) {
          if (dx === 0 && dy === 0) continue;
          if (!present(x + dx, y + dy)) edge = true;
        }
      }
      if (edge) foam.push({ x, y });
    }
  }
  return foam;
}

/**
 * Whether `tool` would actually do something at (x, y). Drives the
 * green/red hover tint in build mode.
 *
 * Decoration placement: invalid if the tool's terrain doesn't match the
 * cell, or if the exact same kind is already in the stack (would be a
 * no-op). Different variants of the same family are valid - they
 * replace the existing family member in place.
 */
export function isToolValidAt(
  tool: BuildTool,
  x: number,
  y: number,
  grid: boolean[][],
  decorations: DecorationsMap,
): boolean {
  const cellHasGrass = grid[y]?.[x] === true;
  const stack = decorations[decorationKey(x, y)];
  if (tool === "grass") return !cellHasGrass;
  if (tool === "fill") return !cellHasGrass;
  if (tool === "erase") return cellHasGrass || (stack !== undefined && stack.length > 0);
  if (tool === "select") return false; // select never paints cells
  // Bridges: normal water placement, OR spanning a raised-platform gap on land.
  if (!isPlacementValid(tool, cellHasGrass) && !bridgeGapValid(tool, x, y, grid, decorations)) return false;
  // Stackable props can repeat in a cell; unique kinds block re-placement.
  if (!isStackable(tool) && stack?.some((e) => e.kind === tool)) return false;
  // Cells acting as a bridge ramp are reserved for the cap - block any
  // new decoration placement there.
  if (hasBridgeCap(x, y, grid, decorations)) return false;
  // Multi-tile buildings: every footprint cell must be land and free of any
  // OTHER building's footprint (the anchor cell itself may be replaced).
  if (DECORATIONS[tool].category === "buildings") {
    const anchorKey = decorationKey(x, y);
    const occ = buildingOccupancy(decorations);
    for (const [cx, cy] of footprintCells(tool, x, y)) {
      if (grid[cy]?.[cx] !== true) return false;
      const owner = occ.get(decorationKey(cx, cy));
      if (owner && owner !== anchorKey) return false;
    }
  }
  return true;
}

export type GridCellProps = {
  x: number;
  y: number;
  isValid: boolean;
  isEditable: boolean;
  onEnter: (x: number, y: number) => void;
  onLeave: (x: number, y: number) => void;
  onClick: (x: number, y: number, shiftKey: boolean) => void;
  onDragOver: (x: number, y: number, e: React.DragEvent<HTMLButtonElement>, isValid: boolean) => void;
  onDragLeave: (x: number, y: number) => void;
  onDrop: (x: number, y: number, e: React.DragEvent<HTMLButtonElement>) => void;
};

/** Memoised overlay cell for build mode — a transparent hit-target only. The
 *  hover tint is a single separate div in the overlay, so cursor moves don't
 *  re-render the whole visible grid (which tanks FPS on large maps). */
export const GridCell = memo(function GridCell({
  x,
  y,
  isValid,
  isEditable,
  onEnter,
  onLeave,
  onClick,
  onDragOver,
  onDragLeave,
  onDrop,
}: GridCellProps) {
  return (
    <button
      type="button"
      onClick={(e) => onClick(x, y, e.shiftKey)}
      onMouseEnter={() => onEnter(x, y)}
      onMouseLeave={() => onLeave(x, y)}
      onDragOver={(e) => onDragOver(x, y, e, isValid)}
      onDragLeave={() => onDragLeave(x, y)}
      onDrop={(e) => onDrop(x, y, e)}
      className="absolute p-0 pointer-events-auto"
      style={{
        left: x * TILE,
        top: y * TILE,
        width: TILE,
        height: TILE,
        border: isEditable ? "1px dashed rgba(255, 255, 255, 0.25)" : "none",
        cursor: isEditable ? (isValid ? "pointer" : "not-allowed") : "default",
      }}
      aria-label={`Cell ${x},${y}`}
    />
  );
});
