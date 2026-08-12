import { useEffect } from "react";
import type React from "react";
import type { DecorationsMap } from "../components/decorations";
import type { AgentPositions } from "../components/office-map";
import type { BuildTool } from "../components/office-build-toolbar";
import type { Snapshot } from "../derive/office-scene-data";

export function useOfficeKeyboardShortcuts(params: {
  buildMode: boolean;
  undoStack: React.RefObject<Snapshot[]>;
  redoStack: React.RefObject<Snapshot[]>;
  currentStateRef: React.RefObject<Snapshot>;
  setGrid: React.Dispatch<React.SetStateAction<boolean[][]>>;
  setDecorations: React.Dispatch<React.SetStateAction<DecorationsMap>>;
  setAgentPositions: React.Dispatch<React.SetStateAction<AgentPositions>>;
  setTool: React.Dispatch<React.SetStateAction<BuildTool | null>>;
  setBuildMode: React.Dispatch<React.SetStateAction<boolean>>;
  setRectStart: React.Dispatch<React.SetStateAction<{ x: number; y: number } | null>>;
  setPendingChanges: React.Dispatch<React.SetStateAction<number>>;
}): void {
  const {
    buildMode,
    undoStack,
    redoStack,
    currentStateRef,
    setGrid,
    setDecorations,
    setAgentPositions,
    setTool,
    setBuildMode,
    setRectStart,
    setPendingChanges,
  } = params;

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const isCmd = e.metaKey || e.ctrlKey;

      if (buildMode && isCmd && e.key === "z" && !e.shiftKey) {
        e.preventDefault();
        const snapshot = undoStack.current.pop();
        if (!snapshot) return;
        redoStack.current.push(currentStateRef.current);
        setGrid(snapshot.grid);
        setDecorations(snapshot.decorations);
        setAgentPositions(snapshot.agentPositions);
        setRectStart(null);
        setPendingChanges((n) => n + 1);
        return;
      }
      if (buildMode && isCmd && ((e.key === "z" && e.shiftKey) || e.key === "y")) {
        e.preventDefault();
        const snapshot = redoStack.current.pop();
        if (!snapshot) return;
        undoStack.current.push(currentStateRef.current);
        setGrid(snapshot.grid);
        setDecorations(snapshot.decorations);
        setAgentPositions(snapshot.agentPositions);
        setRectStart(null);
        setPendingChanges((n) => n + 1);
        return;
      }

      if (isCmd || !buildMode) return;
      if (e.key === "b" || e.key === "B") { e.preventDefault(); setTool("grass"); }
      if (e.key === "e" || e.key === "E") { e.preventDefault(); setTool("erase"); }
      if (e.key === "f" || e.key === "F") { e.preventDefault(); setTool("fill"); }
      if (e.key === "v" || e.key === "V") { e.preventDefault(); setTool("select"); }
      if (e.key === "Escape") { setBuildMode(false); setPendingChanges(0); undoStack.current = []; redoStack.current = []; }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [buildMode, undoStack, redoStack, currentStateRef, setGrid, setDecorations, setAgentPositions, setTool, setBuildMode, setRectStart, setPendingChanges]);
}
