import { startTransition, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import { isToolValidAt, type AgentPositions } from "../components/office-map";
import {
  DECORATIONS,
  applyPlacement,
  decorationKey,
  popDecoration,
  type DecorationKind,
  type DecorationsMap,
} from "../components/decorations";
import { floodFill, type Snapshot } from "./office-scene-data";
import type { BuildTool } from "../components/office-build-toolbar";
import { raisedCells, floodFillRaised } from "../pixi/elevation";
import type { GrassColor } from "../components/grass-colors";

/**
 * Builds the canvas cell-click handler for OfficeScene. Extracted from the
 * component so the dense terrain/decoration/agent mutation logic lives on its
 * own. The handler reads all live state through refs (never closes over React
 * state) so it stays referentially stable — that's what keeps OfficeMap's memo
 * from breaking on every pointer event.
 *
 * Shape: the exported handler is a thin dispatcher — it derives a per-click
 * `ClickCtx`, handles the shift-rectangle special case, then fans `tool` out to
 * one small named op per tool (paintGrass / fillTool / eraseTopmost /
 * placeDecoration). Each op owns one tool's semantics; read the op, not the
 * dispatcher, to understand a given tool.
 */
export interface CellClickDeps {
  currentStateRef: MutableRefObject<Snapshot>;
  rectStartRef: MutableRefObject<{ x: number; y: number } | null>;
  toolRef: MutableRefObject<BuildTool | null>;
  /** The fill tool's own active paint color (picked from its dedicated
   *  swatch row in the build dock while `F` is selected) — independent of
   *  the map's global Island color, so shading a platform never repaints
   *  the rest of the map. */
  fillColorRef: MutableRefObject<GrassColor>;
  undoStack: MutableRefObject<Snapshot[]>;
  redoStack: MutableRefObject<Snapshot[]>;
  setGrid: Dispatch<SetStateAction<boolean[][]>>;
  setDecorations: Dispatch<SetStateAction<DecorationsMap>>;
  setAgentPositions: Dispatch<SetStateAction<AgentPositions>>;
  setRectStart: Dispatch<SetStateAction<{ x: number; y: number } | null>>;
  setPendingChanges: Dispatch<SetStateAction<number>>;
  setSelectedDeco: (value: null) => void;
}

/** Everything a tool op needs for one click: the target cell, a snapshot of the
 *  three state maps, an undo checkpoint, and the setters. Assembled once per
 *  click by the dispatcher and passed to whichever op runs. */
interface ClickCtx {
  x: number;
  y: number;
  /** `decorationKey(x, y)` — the map key for this cell. */
  key: string;
  cellHasGrass: boolean;
  grid: boolean[][];
  decorations: DecorationsMap;
  agentPositions: AgentPositions;
  /** Snapshot pre-edit state onto the undo stack (and clear redo). Call once,
   *  before mutating, inside any op that changes state. */
  pushUndo: () => void;
  setGrid: Dispatch<SetStateAction<boolean[][]>>;
  setDecorations: Dispatch<SetStateAction<DecorationsMap>>;
  setAgentPositions: Dispatch<SetStateAction<AgentPositions>>;
  setRectStart: Dispatch<SetStateAction<{ x: number; y: number } | null>>;
  setPendingChanges: Dispatch<SetStateAction<number>>;
}

type Bounds = { xMin: number; xMax: number; yMin: number; yMax: number };

// ── Immutable map helpers ────────────────────────────────────────────────────

/** Copy `grid` with a single cell set, cloning only the changed row (O(cols),
 *  not O(rows*cols)). Returns the same reference when already at `value`. */
function setCell(grid: boolean[][], x: number, y: number, value: boolean): boolean[][] {
  if (grid[y]?.[x] === value) return grid;
  const next = [...grid];
  next[y] = [...grid[y]!];
  next[y]![x] = value;
  return next;
}

/** Copy a keyed map without one entry. */
function without<T>(map: Record<string, T>, key: string): Record<string, T> {
  const next = { ...map };
  delete next[key];
  return next;
}

/** Copy a keyed map with every cell inside `b` removed. */
function deleteRect<T>(map: Record<string, T>, b: Bounds): Record<string, T> {
  const next = { ...map };
  for (let cy = b.yMin; cy <= b.yMax; cy++)
    for (let cx = b.xMin; cx <= b.xMax; cx++) delete next[decorationKey(cx, cy)];
  return next;
}

// ── Per-tool operations ──────────────────────────────────────────────────────

/** Shift-click rectangle between the stored corner and the clicked cell.
 *  grass → fill the box with land; erase → clear terrain, decorations and
 *  agents in the box. */
function rectFill(ctx: ClickCtx, corner: { x: number; y: number }, tool: "grass" | "erase") {
  ctx.pushUndo();
  const b: Bounds = {
    xMin: Math.min(corner.x, ctx.x),
    xMax: Math.max(corner.x, ctx.x),
    yMin: Math.min(corner.y, ctx.y),
    yMax: Math.max(corner.y, ctx.y),
  };
  const paint = tool === "grass";
  startTransition(() => {
    ctx.setGrid((prev) => {
      const next = [...prev];
      for (let cy = b.yMin; cy <= b.yMax; cy++) {
        next[cy] = [...prev[cy]!];
        for (let cx = b.xMin; cx <= b.xMax; cx++) next[cy]![cx] = paint;
      }
      return next;
    });
    if (!paint) {
      ctx.setDecorations((prev) => deleteRect(prev, b));
      ctx.setAgentPositions((prev) => deleteRect(prev, b));
    }
  });
  ctx.setPendingChanges((n) => n + (b.xMax - b.xMin + 1) * (b.yMax - b.yMin + 1));
  ctx.setRectStart(null);
}

/** Paint a single land cell. Evicts water-only decorations stranded on the new
 *  land, and arms the rectangle corner for a following shift-click. */
function paintGrass(ctx: ClickCtx) {
  if (ctx.cellHasGrass) return;
  const { x, y, key } = ctx;
  ctx.pushUndo();
  ctx.setRectStart({ x, y });
  ctx.setPendingChanges((n) => n + 1);
  startTransition(() => {
    ctx.setGrid((prev) => setCell(prev, x, y, true));
    ctx.setDecorations((prev) => {
      const existing = prev[key];
      if (!existing) return prev;
      const kept = existing.filter((d) => DECORATIONS[d.kind].terrain === "land");
      if (kept.length === existing.length) return prev;
      return kept.length === 0 ? without(prev, key) : { ...prev, [key]: kept };
    });
  });
}

/** Bucket fill, dual-purpose by what's under the cursor:
 *  - water → flood-fill contiguous water into land (turns a pond into island).
 *  - a raised platform → flood-fill the connected platform and stamp every
 *    tile in it with `fillColor` (the fill tool's own swatch row, separate
 *    from the map's global Island color — see `floorShades`/
 *    `floodFillRaised` in pixi/elevation.ts).
 *  No-op on plain (unraised) land, same as before. */
function fillTool(ctx: ClickCtx, fillColor: GrassColor) {
  if (!ctx.cellHasGrass) {
    const [newGrid, count] = floodFill(ctx.grid, ctx.x, ctx.y);
    if (count === 0) return;
    ctx.pushUndo();
    ctx.setPendingChanges((n) => n + count);
    startTransition(() => ctx.setGrid(newGrid));
    return;
  }

  const cluster = floodFillRaised(raisedCells(ctx.decorations), ctx.x, ctx.y);
  if (cluster.length === 0) return;
  ctx.pushUndo();
  ctx.setPendingChanges((n) => n + cluster.length);
  startTransition(() => {
    ctx.setDecorations((prev) => {
      const next = { ...prev };
      for (const key of cluster) {
        const stack = next[key];
        if (!stack) continue;
        next[key] = stack.map((inst) =>
          DECORATIONS[inst.kind].family === "floor" ? { ...inst, shade: fillColor } : inst,
        );
      }
      return next;
    });
  });
}

/** Erase the topmost thing on the cell: agent first, then the top decoration
 *  (LIFO), then terrain. */
function eraseTopmost(ctx: ClickCtx) {
  const { key, decorations, agentPositions, x, y } = ctx;

  // 1. Agent sits on top of everything (including any bridge under it).
  if (agentPositions[key]) {
    ctx.pushUndo();
    ctx.setAgentPositions((prev) => without(prev, key));
    ctx.setPendingChanges((n) => n + 1);
    return;
  }

  // 2. Pop the top decoration off the stack.
  const stack = decorations[key];
  if (stack && stack.length > 0) {
    const popped = popDecoration(stack);
    if (!popped) return;
    ctx.pushUndo();
    ctx.setDecorations((prev) =>
      popped.stack.length === 0 ? without(prev, key) : { ...prev, [key]: popped.stack },
    );
    ctx.setPendingChanges((n) => n + 1);
    return;
  }

  // 3. Nothing on top — clear the terrain. Arms the rectangle corner.
  if (ctx.cellHasGrass) {
    ctx.pushUndo();
    ctx.setRectStart({ x, y });
    ctx.setPendingChanges((n) => n + 1);
    startTransition(() => ctx.setGrid((prev) => setCell(prev, x, y, false)));
  }
}

/** Place a decoration if the cell (and, for multi-tile buildings, the whole
 *  footprint) passes terrain/bridge-ramp validation. */
function placeDecoration(ctx: ClickCtx, tool: DecorationKind) {
  if (!isToolValidAt(tool, ctx.x, ctx.y, ctx.grid, ctx.decorations)) return;
  ctx.pushUndo();
  ctx.setDecorations((prev) => ({ ...prev, [ctx.key]: applyPlacement(prev[ctx.key], tool) }));
  ctx.setPendingChanges((n) => n + 1);
}

// ── Dispatcher ───────────────────────────────────────────────────────────────

export function createCellClickHandler(deps: CellClickDeps) {
  const { currentStateRef, rectStartRef, toolRef, fillColorRef, undoStack, redoStack, setSelectedDeco } = deps;

  return (x: number, y: number, shiftKey = false) => {
    const tool = toolRef.current;
    if (!tool) return;

    // Snapshot live state from refs — the handler never closes over React state.
    const { grid, decorations, agentPositions } = currentStateRef.current;
    const ctx: ClickCtx = {
      x,
      y,
      key: decorationKey(x, y),
      cellHasGrass: grid[y]?.[x] === true,
      grid,
      decorations,
      agentPositions,
      pushUndo: () => {
        undoStack.current = [...undoStack.current.slice(-49), { grid, decorations, agentPositions }];
        redoStack.current = [];
      },
      setGrid: deps.setGrid,
      setDecorations: deps.setDecorations,
      setAgentPositions: deps.setAgentPositions,
      setRectStart: deps.setRectStart,
      setPendingChanges: deps.setPendingChanges,
    };

    // Shift-rectangle is a conjunction (shift + a stored corner + a terrain
    // tool), not a per-tool fan-out, so it's handled before the match.
    const rectStart = rectStartRef.current;
    if (shiftKey && rectStart && (tool === "grass" || tool === "erase")) {
      rectFill(ctx, rectStart, tool);
      return;
    }

    switch (tool) {
      // Free-hand select never paints — overlay hit-targets handle selection; a
      // click on empty ground just clears it.
      case "select":
        setSelectedDeco(null);
        break;
      case "grass":
        paintGrass(ctx);
        break;
      case "fill":
        fillTool(ctx, fillColorRef.current);
        break;
      case "erase":
        eraseTopmost(ctx);
        break;
      default:
        placeDecoration(ctx, tool);
    }
  };
}
