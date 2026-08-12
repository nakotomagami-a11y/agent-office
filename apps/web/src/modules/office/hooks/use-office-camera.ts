"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { TILE } from "../components/office-map";

// Build area — a large Civ-style map (~5× the original 48×30) so a generated
// landmass leaves plenty of water to expand into. Terrain + foam render as
// batched @pixi/tilemap layers (≈1 draw call each), so tile count barely costs.
export const GRID_COLS = 108;
export const GRID_ROWS = 68;
const MAP_W = GRID_COLS * TILE;
const MAP_H = GRID_ROWS * TILE;
// Low enough to fit the whole map on screen when zoomed all the way out.
const ZOOM_MIN = 0.1;
const ZOOM_MAX = 3.0;
export const ZOOM_STEP = 0.15;

export function useOfficeCamera() {
  const [zoom, setZoom] = useState(1.0);
  const [panX, setPanX] = useState(0);
  const [panY, setPanY] = useState(0);

  const containerRef = useRef<HTMLDivElement>(null);
  const panInitRef = useRef(false);
  const zoomRef = useRef(zoom);
  const panRef = useRef({ x: panX, y: panY });
  const isDragging = useRef(false);
  const hasDragged = useRef(false);
  const dragStart = useRef({ mx: 0, my: 0, px: 0, py: 0 });

  useEffect(() => { zoomRef.current = zoom; }, [zoom]);
  useEffect(() => { panRef.current = { x: panX, y: panY }; }, [panX, panY]);

  // Centre map on first paint
  useEffect(() => {
    if (panInitRef.current) return;
    const el = containerRef.current;
    if (!el) return;
    panInitRef.current = true;
    const { width, height } = el.getBoundingClientRect();
    const fitZoom = Math.min(width / MAP_W, height / MAP_H, 1) * 0.85;
    const z = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, fitZoom));
    setZoom(z);
    setPanX((width - MAP_W * z) / 2);
    setPanY((height - MAP_H * z) / 2);
  }, []);

  // Scroll-wheel → zoom to cursor
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      // ctrlKey = pinch gesture or Ctrl+scroll → zoom; plain scroll → pan
      if (e.ctrlKey) {
        const rect = el.getBoundingClientRect();
        const mx = e.clientX - rect.left;
        const my = e.clientY - rect.top;
        const z = zoomRef.current;
        const p = panRef.current;
        const factor = e.deltaY < 0 ? 1 + ZOOM_STEP : 1 - ZOOM_STEP;
        const newZoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, z * factor));
        const wx = (mx - p.x) / z;
        const wy = (my - p.y) / z;
        setZoom(newZoom);
        setPanX(mx - wx * newZoom);
        setPanY(my - wy * newZoom);
      } else {
        setPanX((x) => x - e.deltaX);
        setPanY((y) => y - e.deltaY);
      }
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  // Arrow key panning + -/= keyboard zoom
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const step = TILE * zoomRef.current;
      if (e.key === "ArrowLeft")  { e.preventDefault(); setPanX((x) => x + step); }
      if (e.key === "ArrowRight") { e.preventDefault(); setPanX((x) => x - step); }
      if (e.key === "ArrowUp")    { e.preventDefault(); setPanY((y) => y + step); }
      if (e.key === "ArrowDown")  { e.preventDefault(); setPanY((y) => y - step); }
      if (e.key === "-") {
        e.preventDefault();
        const el = containerRef.current;
        const z = zoomRef.current;
        const p = panRef.current;
        const cx = el ? el.clientWidth / 2 : MAP_W / 2;
        const cy = el ? el.clientHeight / 2 : MAP_H / 2;
        const newZoom = Math.max(ZOOM_MIN, z * (1 - ZOOM_STEP));
        setZoom(newZoom);
        setPanX(cx - (cx - p.x) / z * newZoom);
        setPanY(cy - (cy - p.y) / z * newZoom);
      }
      if (e.key === "=" || e.key === "+") {
        e.preventDefault();
        const el = containerRef.current;
        const z = zoomRef.current;
        const p = panRef.current;
        const cx = el ? el.clientWidth / 2 : MAP_W / 2;
        const cy = el ? el.clientHeight / 2 : MAP_H / 2;
        const newZoom = Math.min(ZOOM_MAX, z * (1 + ZOOM_STEP));
        setZoom(newZoom);
        setPanX(cx - (cx - p.x) / z * newZoom);
        setPanY(cy - (cy - p.y) / z * newZoom);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const onPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const onInteractive = !!(e.target as Element).closest('button, a, input, [draggable="true"]');
    const isPan = e.button === 1 || (e.button === 0 && !onInteractive);
    if (!isPan) return;
    isDragging.current = true;
    hasDragged.current = false;
    dragStart.current = { mx: e.clientX, my: e.clientY, px: panRef.current.x, py: panRef.current.y };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    if (e.button === 1) e.preventDefault();
    if (containerRef.current) containerRef.current.style.cursor = "grabbing";
  }, []);

  const onPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging.current) return;
    const dx = e.clientX - dragStart.current.mx;
    const dy = e.clientY - dragStart.current.my;
    if (!hasDragged.current && Math.hypot(dx, dy) < 4) return;
    hasDragged.current = true;
    setPanX(dragStart.current.px + dx);
    setPanY(dragStart.current.py + dy);
  }, []);

  const onPointerUp = useCallback(() => {
    isDragging.current = false;
    if (containerRef.current) containerRef.current.style.cursor = "";
  }, []);

  const zoomBy = useCallback((factor: number) => {
    const z = zoomRef.current;
    const p = panRef.current;
    const el = containerRef.current;
    const cx = el ? el.clientWidth / 2 : MAP_W / 2;
    const cy = el ? el.clientHeight / 2 : MAP_H / 2;
    const newZoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, z * factor));
    const wx = (cx - p.x) / z;
    const wy = (cy - p.y) / z;
    setZoom(newZoom);
    setPanX(cx - wx * newZoom);
    setPanY(cy - wy * newZoom);
  }, []);

  // Centre the viewport on a specific tile at a target zoom (0..1+). Used by the
  // agent search to fly to a picked agent.
  const focusOn = useCallback((tileX: number, tileY: number, targetZoom = 0.75) => {
    const el = containerRef.current;
    if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    const z = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, targetZoom));
    const worldX = tileX * TILE + TILE / 2;
    const worldY = tileY * TILE + TILE / 2;
    setZoom(z);
    setPanX(width / 2 - worldX * z);
    setPanY(height / 2 - worldY * z);
  }, []);

  const resetCamera = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    const fitZoom = Math.min(width / MAP_W, height / MAP_H, 1) * 0.85;
    const z = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, fitZoom));
    setZoom(z);
    setPanX((width - MAP_W * z) / 2);
    setPanY((height - MAP_H * z) / 2);
  }, []);

  return {
    zoom, panX, panY,
    containerRef,
    zoomRef,
    panRef,
    onPointerDown,
    onPointerMove,
    onPointerUp,
    zoomBy,
    resetCamera,
    focusOn,
  };
}
