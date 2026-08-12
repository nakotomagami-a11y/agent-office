"use client";

import { useCallback, useEffect, useState, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import { TILE, type AgentPositions } from "../components/office-map";
import { GRID_COLS, GRID_ROWS } from "./use-office-camera";
import type { BuildTool } from "../components/office-build-toolbar";
import type { Snapshot } from "../derive/office-scene-data";
import {
  decorationKey,
  familyOf,
  isPlacementValid,
  isStackable,
  type BuildingColor,
  type DecoInstance,
  type DecorationsMap,
} from "../components/decorations";

/** How the arrow keys move the selected object: whole tiles vs sub-tile pixels. */
export type ArrowMode = "tile" | "pixel";

type Params = {
  tool: BuildTool | null;
  buildMode: boolean;
  setDecorations: Dispatch<SetStateAction<DecorationsMap>>;
  setAgentPositions: Dispatch<SetStateAction<AgentPositions>>;
  currentStateRef: MutableRefObject<Snapshot>;
  undoStack: MutableRefObject<Snapshot[]>;
  redoStack: MutableRefObject<Snapshot[]>;
  setPendingChanges: Dispatch<SetStateAction<number>>;
};

/**
 * Select-tool editing for the office canvas: which decoration / agent is
 * selected and every mutation the select menu + keyboard drive (rotate, mirror,
 * colour, layer/z, pixel-nudge, whole-tile move, recentre) plus the keyboard
 * wiring. Extracted from OfficeScene so the component stays markup-only.
 */
export function useCanvasEditing({
  tool,
  buildMode,
  setDecorations,
  setAgentPositions,
  currentStateRef,
  undoStack,
  redoStack,
  setPendingChanges,
}: Params) {
  const [selectedDeco, setSelectedDeco] = useState<{ key: string; index: number } | null>(null);
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);
  const [arrowMode, setArrowMode] = useState<ArrowMode>("tile");

  const NUDGE_MAX = TILE; // clamp per-instance offset to ±1 tile

  const snapshot = useCallback(() => {
    const { grid, decorations, agentPositions } = currentStateRef.current;
    undoStack.current = [...undoStack.current.slice(-49), { grid, decorations, agentPositions }];
    redoStack.current = [];
  }, [currentStateRef, undoStack, redoStack]);

  // ── Decoration editing ─────────────────────────────────────────────────────
  const mutateDeco = useCallback(
    (key: string, index: number, fn: (inst: DecoInstance) => DecoInstance | null) => {
      snapshot();
      setDecorations((prev) => {
        const stack = prev[key];
        if (!stack || !stack[index]) return prev;
        const updated = fn(stack[index]!);
        const nextStack = [...stack];
        if (updated === null) nextStack.splice(index, 1);
        else nextStack[index] = updated;
        const next = { ...prev };
        if (nextStack.length === 0) delete next[key];
        else next[key] = nextStack;
        return next;
      });
      setPendingChanges((n) => n + 1);
    },
    [snapshot, setDecorations, setPendingChanges],
  );

  const rotateSelected = useCallback(() => {
    if (!selectedDeco) return;
    mutateDeco(selectedDeco.key, selectedDeco.index, (inst) => ({
      ...inst,
      rot: (((inst.rot ?? 0) + 1) % 3) as 0 | 1 | 2,
    }));
  }, [selectedDeco, mutateDeco]);

  const flipSelected = useCallback(() => {
    if (!selectedDeco) return;
    mutateDeco(selectedDeco.key, selectedDeco.index, (inst) => ({ ...inst, flip: !inst.flip }));
  }, [selectedDeco, mutateDeco]);

  const colorSelected = useCallback((color: BuildingColor) => {
    if (!selectedDeco) return;
    mutateDeco(selectedDeco.key, selectedDeco.index, (inst) => ({
      ...inst,
      color: color === "blue" ? undefined : color,
    }));
  }, [selectedDeco, mutateDeco]);

  const restackSelected = useCallback((delta: number) => {
    if (!selectedDeco) return;
    mutateDeco(selectedDeco.key, selectedDeco.index, (inst) => {
      const z = (inst.z ?? 0) + delta;
      return { ...inst, z: z === 0 ? undefined : z };
    });
  }, [selectedDeco, mutateDeco]);

  const nudgeSelected = useCallback(
    (dx: number, dy: number) => {
      if (!selectedDeco) return;
      const clamp = (v: number) => Math.max(-NUDGE_MAX, Math.min(NUDGE_MAX, v));
      mutateDeco(selectedDeco.key, selectedDeco.index, (inst) => ({
        ...inst,
        dx: clamp((inst.dx ?? 0) + dx),
        dy: clamp((inst.dy ?? 0) + dy),
      }));
    },
    [selectedDeco, mutateDeco, NUDGE_MAX],
  );

  const deleteSelected = useCallback(() => {
    if (!selectedDeco) return;
    mutateDeco(selectedDeco.key, selectedDeco.index, () => null);
    setSelectedDeco(null);
  }, [selectedDeco, mutateDeco]);

  const selectDeco = useCallback((key: string, index: number) => { setSelectedAgent(null); setSelectedDeco({ key, index }); }, []);
  const deselectDeco = useCallback(() => setSelectedDeco(null), []);

  // Drag-to-reposition: the overlay calls beginDecoDrag on the first move (one
  // undo snapshot + select) then setDecoOffset live (no more snapshots).
  const beginDecoDrag = useCallback((key: string, index: number) => {
    snapshot();
    setSelectedDeco({ key, index });
  }, [snapshot]);

  const setDecoOffset = useCallback((key: string, index: number, dx: number, dy: number) => {
    const clamp = (v: number) => Math.max(-NUDGE_MAX, Math.min(NUDGE_MAX, Math.round(v)));
    setDecorations((prev) => {
      const stack = prev[key];
      if (!stack || !stack[index]) return prev;
      const ns = [...stack];
      ns[index] = { ...ns[index]!, dx: clamp(dx), dy: clamp(dy) };
      return { ...prev, [key]: ns };
    });
    setPendingChanges((n) => n + 1);
  }, [NUDGE_MAX, setDecorations, setPendingChanges]);

  const resetDecoOffset = useCallback(() => {
    if (!selectedDeco) return;
    mutateDeco(selectedDeco.key, selectedDeco.index, (inst) => ({ ...inst, dx: undefined, dy: undefined }));
  }, [selectedDeco, mutateDeco]);

  const moveDecoCell = useCallback((dxTile: number, dyTile: number) => {
    if (!selectedDeco) return;
    const { grid, decorations } = currentStateRef.current;
    const [xs, ys] = selectedDeco.key.split(",");
    const nx = Number(xs) + dxTile;
    const ny = Number(ys) + dyTile;
    if (nx < 0 || ny < 0 || nx >= GRID_COLS || ny >= GRID_ROWS) return;
    const inst = decorations[selectedDeco.key]?.[selectedDeco.index];
    if (!inst) return;
    if (!isPlacementValid(inst.kind, grid[ny]?.[nx] === true)) return;
    const newKey = decorationKey(nx, ny);
    const targetStack = decorations[newKey] ?? [];
    // Non-stackable (buildings/bridges): block if the target already holds a
    // same-family object. Stackable props may pile up.
    if (!isStackable(inst.kind) && targetStack.some((e) => familyOf(e.kind) === familyOf(inst.kind))) return;
    snapshot();
    const newIndex = targetStack.length;
    setDecorations((prev) => {
      const next = { ...prev };
      const os = [...(next[selectedDeco.key] ?? [])];
      os.splice(selectedDeco.index, 1);
      if (os.length === 0) delete next[selectedDeco.key];
      else next[selectedDeco.key] = os;
      next[newKey] = [...(next[newKey] ?? []), inst];
      return next;
    });
    setSelectedDeco({ key: newKey, index: newIndex });
    setPendingChanges((n) => n + 1);
  }, [selectedDeco, currentStateRef, snapshot, setDecorations, setPendingChanges]);

  // ── Agent editing ──────────────────────────────────────────────────────────
  const mutateAgent = useCallback(
    (key: string, fn: (a: AgentPositions[string]) => AgentPositions[string]) => {
      snapshot();
      setAgentPositions((prev) => {
        const cur = prev[key];
        if (!cur) return prev;
        return { ...prev, [key]: fn(cur) };
      });
      setPendingChanges((n) => n + 1);
    },
    [snapshot, setAgentPositions, setPendingChanges],
  );

  const flipAgent = useCallback(() => {
    if (!selectedAgent) return;
    mutateAgent(selectedAgent, (a) => ({ ...a, flip: a.flip ? undefined : true }));
  }, [selectedAgent, mutateAgent]);

  const restackAgent = useCallback((delta: number) => {
    if (!selectedAgent) return;
    mutateAgent(selectedAgent, (a) => {
      const z = (a.z ?? 0) + delta;
      return { ...a, z: z === 0 ? undefined : z };
    });
  }, [selectedAgent, mutateAgent]);

  const nudgeAgent = useCallback((dx: number, dy: number) => {
    if (!selectedAgent) return;
    const clamp = (v: number) => Math.max(-NUDGE_MAX, Math.min(NUDGE_MAX, v));
    mutateAgent(selectedAgent, (a) => ({
      ...a,
      dx: clamp((a.dx ?? 0) + dx) || undefined,
      dy: clamp((a.dy ?? 0) + dy) || undefined,
    }));
  }, [selectedAgent, mutateAgent, NUDGE_MAX]);

  const selectAgentInstance = useCallback((key: string) => {
    setSelectedDeco(null);
    setSelectedAgent(key);
  }, []);

  const beginAgentDrag = useCallback((key: string) => {
    snapshot();
    setSelectedDeco(null);
    setSelectedAgent(key);
  }, [snapshot]);

  const setAgentOffset = useCallback((key: string, dx: number, dy: number) => {
    const clamp = (v: number) => Math.max(-NUDGE_MAX, Math.min(NUDGE_MAX, Math.round(v)));
    setAgentPositions((prev) => {
      const cur = prev[key];
      if (!cur) return prev;
      return { ...prev, [key]: { ...cur, dx: clamp(dx) || undefined, dy: clamp(dy) || undefined } };
    });
    setPendingChanges((n) => n + 1);
  }, [NUDGE_MAX, setAgentPositions, setPendingChanges]);

  const resetAgentOffset = useCallback(() => {
    if (!selectedAgent) return;
    mutateAgent(selectedAgent, (a) => ({ ...a, dx: undefined, dy: undefined }));
  }, [selectedAgent, mutateAgent]);

  const moveAgentCell = useCallback((dxTile: number, dyTile: number) => {
    if (!selectedAgent) return;
    const { agentPositions } = currentStateRef.current;
    const [xs, ys] = selectedAgent.split(",");
    const nx = Number(xs) + dxTile;
    const ny = Number(ys) + dyTile;
    if (nx < 0 || ny < 0 || nx >= GRID_COLS || ny >= GRID_ROWS) return;
    const cur = agentPositions[selectedAgent];
    if (!cur) return;
    const newKey = decorationKey(nx, ny);
    if (agentPositions[newKey]) return; // don't stack two agents on one tile
    snapshot();
    setAgentPositions((prev) => {
      const next = { ...prev };
      delete next[selectedAgent];
      next[newKey] = cur;
      return next;
    });
    setSelectedAgent(newKey);
    setPendingChanges((n) => n + 1);
  }, [selectedAgent, currentStateRef, snapshot, setAgentPositions, setPendingChanges]);

  // Clear selection when leaving the select tool / build mode.
  useEffect(() => {
    if (tool !== "select" || !buildMode) { setSelectedDeco(null); setSelectedAgent(null); }
  }, [tool, buildMode]);

  // Keyboard for a selected decoration. Capture phase + stopImmediatePropagation
  // so these win over the camera's arrow-pan and the build-mode Escape.
  useEffect(() => {
    if (tool !== "select" || !selectedDeco) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const step = e.shiftKey ? 8 : 1;
      const claim = () => { e.preventDefault(); e.stopImmediatePropagation(); };
      const arrow = (dxTile: number, dyTile: number) =>
        arrowMode === "tile" ? moveDecoCell(dxTile, dyTile) : nudgeSelected(dxTile * step, dyTile * step);
      switch (e.key) {
        case "Escape": claim(); setSelectedDeco(null); break;
        case "Delete":
        case "Backspace": claim(); deleteSelected(); break;
        case "r": case "R": claim(); rotateSelected(); break;
        case "m": case "M": claim(); flipSelected(); break;
        case "ArrowLeft":  claim(); arrow(-1, 0); break;
        case "ArrowRight": claim(); arrow(1, 0); break;
        case "ArrowUp":    claim(); arrow(0, -1); break;
        case "ArrowDown":  claim(); arrow(0, 1); break;
      }
    };
    window.addEventListener("keydown", onKey, { capture: true });
    return () => window.removeEventListener("keydown", onKey, { capture: true });
  }, [tool, selectedDeco, arrowMode, deleteSelected, nudgeSelected, moveDecoCell, rotateSelected, flipSelected]);

  // Same keyboard editing for a selected agent (mirror + move; no rotate/delete).
  useEffect(() => {
    if (tool !== "select" || !selectedAgent) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const step = e.shiftKey ? 8 : 1;
      const claim = () => { e.preventDefault(); e.stopImmediatePropagation(); };
      const arrow = (dxTile: number, dyTile: number) =>
        arrowMode === "tile" ? moveAgentCell(dxTile, dyTile) : nudgeAgent(dxTile * step, dyTile * step);
      switch (e.key) {
        case "Escape": claim(); setSelectedAgent(null); break;
        case "m": case "M": claim(); flipAgent(); break;
        case "ArrowLeft":  claim(); arrow(-1, 0); break;
        case "ArrowRight": claim(); arrow(1, 0); break;
        case "ArrowUp":    claim(); arrow(0, -1); break;
        case "ArrowDown":  claim(); arrow(0, 1); break;
      }
    };
    window.addEventListener("keydown", onKey, { capture: true });
    return () => window.removeEventListener("keydown", onKey, { capture: true });
  }, [tool, selectedAgent, arrowMode, flipAgent, nudgeAgent, moveAgentCell]);

  return {
    selectedDeco, setSelectedDeco,
    selectedAgent, setSelectedAgent,
    arrowMode, setArrowMode,
    rotateSelected, flipSelected, colorSelected, restackSelected, nudgeSelected,
    deleteSelected, selectDeco, deselectDeco, beginDecoDrag, setDecoOffset,
    resetDecoOffset, moveDecoCell,
    flipAgent, restackAgent, nudgeAgent, selectAgentInstance, beginAgentDrag,
    setAgentOffset, resetAgentOffset, moveAgentCell,
  };
}
