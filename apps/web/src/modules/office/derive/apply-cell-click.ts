import { startTransition, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import { match } from "ts-pattern";
import { isToolValidAt, type AgentPositions } from "../components/office-map";
import {
  DECORATIONS,
  applyPlacement,
  decorationKey,
  familyOf,
  popDecoration,
  type DecorationsMap,
} from "../components/decorations";
import { floodFill, type Snapshot } from "./office-scene-data";
import type { BuildTool } from "../components/office-build-toolbar";

/**
 * Builds the canvas cell-click handler for OfficeScene. Extracted from the
 * component so the dense terrain/decoration/agent mutation logic lives on its
 * own. The handler reads all live state through refs (never closes over React
 * state) so it stays referentially stable — that's what keeps OfficeMap's memo
 * from breaking on every pointer event.
 *
 * Tool semantics:
 * - select: clears the current decoration selection (overlay hit-targets select).
 * - grass / erase + shift: rectangle fill/clear between the stored rectStart and
 *   the clicked cell.
 * - grass: paints a single land cell, evicting water-only decorations stranded
 *   on the new land.
 * - fill: flood-fills contiguous water from the clicked cell.
 * - erase: removes topmost first — agent → decoration (LIFO) → terrain; removing
 *   a bridge from water evicts any agent standing on it.
 * - decoration tools: validate terrain/footprint, then push onto the cell stack.
 */
export interface CellClickDeps {
  currentStateRef: MutableRefObject<Snapshot>;
  rectStartRef: MutableRefObject<{ x: number; y: number } | null>;
  toolRef: MutableRefObject<BuildTool | null>;
  undoStack: MutableRefObject<Snapshot[]>;
  redoStack: MutableRefObject<Snapshot[]>;
  setGrid: Dispatch<SetStateAction<boolean[][]>>;
  setDecorations: Dispatch<SetStateAction<DecorationsMap>>;
  setAgentPositions: Dispatch<SetStateAction<AgentPositions>>;
  setRectStart: Dispatch<SetStateAction<{ x: number; y: number } | null>>;
  setPendingChanges: Dispatch<SetStateAction<number>>;
  setSelectedDeco: (value: null) => void;
}

export function createCellClickHandler(deps: CellClickDeps) {
  const {
    currentStateRef,
    rectStartRef,
    toolRef,
    undoStack,
    redoStack,
    setGrid,
    setDecorations,
    setAgentPositions,
    setRectStart,
    setPendingChanges,
    setSelectedDeco,
  } = deps;

  return (x: number, y: number, shiftKey = false) => {
    // Read all state from refs — this handler never closes over state.
    const { grid, decorations, agentPositions } = currentStateRef.current;
    const rectStart = rectStartRef.current;
    const tool = toolRef.current;

    const key = decorationKey(x, y);
    const cellHasGrass = grid[y]?.[x] === true;

    // Snapshot the pre-edit state onto the undo stack (and clear redo). Called by
    // every mutating branch right before it changes state.
    const pushUndo = () => {
      undoStack.current = [...undoStack.current.slice(-49), { grid, decorations, agentPositions }];
      redoStack.current = [];
    };

    // Guard: no active tool — nothing to do.
    if (!tool) return;

    // Guard, not a fan-out: this is a conjunction (shiftKey AND a stored corner
    // AND a terrain tool), so it stays an early `if` rather than a match case.
    // Shift-click rectangle fill/clear between rectStart and the clicked cell.
    if (shiftKey && rectStart && (tool === "grass" || tool === "erase")) {
      pushUndo();
      const xMin = Math.min(rectStart.x, x);
      const xMax = Math.max(rectStart.x, x);
      const yMin = Math.min(rectStart.y, y);
      const yMax = Math.max(rectStart.y, y);
      if (tool === "grass") {
        startTransition(() => {
          setGrid((prev) => {
            const next = [...prev];
            for (let cy = yMin; cy <= yMax; cy++) {
              next[cy] = [...prev[cy]!];
              for (let cx = xMin; cx <= xMax; cx++) next[cy]![cx] = true;
            }
            return next;
          });
        });
      } else {
        startTransition(() => {
          setGrid((prev) => {
            const next = [...prev];
            for (let cy = yMin; cy <= yMax; cy++) {
              next[cy] = [...prev[cy]!];
              for (let cx = xMin; cx <= xMax; cx++) next[cy]![cx] = false;
            }
            return next;
          });
          setDecorations((prev) => {
            const next = { ...prev };
            for (let cy = yMin; cy <= yMax; cy++)
              for (let cx = xMin; cx <= xMax; cx++)
                delete next[decorationKey(cx, cy)];
            return next;
          });
          setAgentPositions((prev) => {
            const next = { ...prev };
            for (let cy = yMin; cy <= yMax; cy++)
              for (let cx = xMin; cx <= xMax; cx++)
                delete next[decorationKey(cx, cy)];
            return next;
          });
        });
      }
      setPendingChanges((n) => n + (xMax - xMin + 1) * (yMax - yMin + 1));
      setRectStart(null);
      return;
    }

    match(tool)
      // Free-hand select never paints — decoration hit-targets in the overlay
      // handle selection. A click on empty ground just clears the selection.
      .with("select", () => {
        setSelectedDeco(null);
      })
      .with("grass", () => {
        if (cellHasGrass) return;
        pushUndo();
        setRectStart({ x, y });
        setPendingChanges((n) => n + 1);
        startTransition(() => {
          // Only copy the one row that changes — O(GRID_COLS) not O(GRID_ROWS*GRID_COLS)
          setGrid((prev) => {
            if (prev[y]?.[x] === true) return prev;
            const next = [...prev];
            next[y] = [...prev[y]!];
            next[y]![x] = true;
            return next;
          });
          // Drop any water-only decorations now stranded on land
          setDecorations((prev) => {
            const existing = prev[key];
            if (!existing) return prev;
            const kept = existing.filter((k) => DECORATIONS[k.kind].terrain === "land");
            if (kept.length === existing.length) return prev;
            const next = { ...prev };
            if (kept.length === 0) delete next[key];
            else next[key] = kept;
            return next;
          });
        });
      })
      .with("fill", () => {
        if (cellHasGrass) return;
        const [newGrid, count] = floodFill(grid, x, y);
        if (count === 0) return;
        pushUndo();
        setPendingChanges((n) => n + count);
        startTransition(() => {
          setGrid(newGrid);
        });
      })
      .with("erase", () => {
        // Topmost first: agent → decoration (LIFO from stack) → terrain
        if (agentPositions[key]) {
          pushUndo();
          setAgentPositions((prev) => {
            const next = { ...prev };
            delete next[key];
            return next;
          });
          setPendingChanges((n) => n + 1);
          return;
        }
        const stack = decorations[key];
        if (stack && stack.length > 0) {
          const popped = popDecoration(stack);
          if (popped) {
            pushUndo();
            setDecorations((prev) => {
              const next = { ...prev };
              if (popped.stack.length === 0) delete next[key];
              else next[key] = popped.stack;
              return next;
            });
            // If a bridge was removed from a water cell, evict any agent.
            const isWater = grid[y]?.[x] !== true;
            const bridgeGone = isWater && !popped.stack.some((k) => familyOf(k.kind) === "bridge");
            if (bridgeGone && agentPositions[key]) {
              setAgentPositions((prev) => {
                const next = { ...prev };
                delete next[key];
                return next;
              });
            }
            setPendingChanges((n) => n + 1);
          }
          return;
        }
        if (cellHasGrass) {
          pushUndo();
          setRectStart({ x, y });
          setPendingChanges((n) => n + 1);
          startTransition(() => {
            // Only copy the one row that changes
            setGrid((prev) => {
              if (prev[y]?.[x] !== true) return prev;
              const next = [...prev];
              next[y] = [...prev[y]!];
              next[y]![x] = false;
              return next;
            });
          });
        }
      })
      // Decoration tools (DecorationKind): validate terrain, bridge ramps, and
      // (for multi-tile buildings) that the whole footprint is clear land.
      .otherwise((decoTool) => {
        if (!isToolValidAt(decoTool, x, y, grid, decorations)) return;
        pushUndo();
        setDecorations((prev) => {
          const stack = applyPlacement(prev[key], decoTool);
          return { ...prev, [key]: stack };
        });
        setPendingChanges((n) => n + 1);
      });
  };
}
