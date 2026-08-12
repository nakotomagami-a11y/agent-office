"use client";

import { useCallback, useRef } from "react";
import { TILE } from "../components/office-map";
import type { BuildTool } from "../components/office-build-toolbar";
import { GRID_COLS, GRID_ROWS } from "./use-office-camera";

export function useOfficePainting({
  panRef,
  zoomRef,
}: {
  panRef: React.MutableRefObject<{ x: number; y: number }>;
  zoomRef: React.MutableRefObject<number>;
}) {
  const isPainting = useRef(false);
  const buildModeRef = useRef(false);
  const toolRef = useRef<BuildTool | null>(null);
  const onCellClickRef = useRef<(x: number, y: number) => void>(() => undefined);
  // Dedup: skip onCellClick when the tile coord hasn't changed during a drag
  const lastPaintedTile = useRef<{ x: number; y: number } | null>(null);
  // Cache getBoundingClientRect on pointerdown — calling it on every pointermove
  // forces a layout reflow. The rect is stable for the duration of a drag.
  const cachedRectRef = useRef<DOMRect | null>(null);

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>): boolean => {
      const isOnOverlay = !!(e.target as Element).closest(
        ".build-panel, .canvas-tools, .build-actions-bar, .canvas-info, .build-entry-btn",
      );
      if (
        e.button === 0 &&
        buildModeRef.current &&
        // grass/erase paint terrain; "floor" raises a tier — all three support
        // click-drag to fill a region instead of one cell at a time.
        (toolRef.current === "grass" || toolRef.current === "erase" || toolRef.current === "floor") &&
        !isOnOverlay
      ) {
        isPainting.current = true;
        lastPaintedTile.current = null;
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
        cachedRectRef.current = rect;
        const wx = (e.clientX - rect.left - panRef.current.x) / zoomRef.current;
        const wy = (e.clientY - rect.top - panRef.current.y) / zoomRef.current;
        const tx = Math.floor(wx / TILE);
        const ty = Math.floor(wy / TILE);
        if (tx >= 0 && tx < GRID_COLS && ty >= 0 && ty < GRID_ROWS) {
          lastPaintedTile.current = { x: tx, y: ty };
          onCellClickRef.current(tx, ty);
        }
        return true;
      }
      return false;
    },
    [panRef, zoomRef],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>): boolean => {
      if (!isPainting.current) return false;
      // Reuse the rect cached on pointerdown — no layout reflow on every move
      const rect = cachedRectRef.current ?? (e.currentTarget as HTMLElement).getBoundingClientRect();
      const wx = (e.clientX - rect.left - panRef.current.x) / zoomRef.current;
      const wy = (e.clientY - rect.top - panRef.current.y) / zoomRef.current;
      const tx = Math.floor(wx / TILE);
      const ty = Math.floor(wy / TILE);
      if (tx >= 0 && tx < GRID_COLS && ty >= 0 && ty < GRID_ROWS) {
        const last = lastPaintedTile.current;
        if (!last || last.x !== tx || last.y !== ty) {
          lastPaintedTile.current = { x: tx, y: ty };
          onCellClickRef.current(tx, ty);
        }
      }
      return true;
    },
    [panRef, zoomRef],
  );

  const onPointerUp = useCallback(() => {
    isPainting.current = false;
    lastPaintedTile.current = null;
  }, []);

  return {
    buildModeRef,
    toolRef,
    onCellClickRef,
    onPointerDown,
    onPointerMove,
    onPointerUp,
  };
}
