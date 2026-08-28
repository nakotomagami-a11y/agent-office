"use client";

import { useEffect, useState, type Dispatch, type SetStateAction } from "react";
import { useTranslations } from "next-intl";
import { motion, AnimatePresence } from "framer-motion";
import { Icon } from "@/components/ui/icon";
import { GRID_COLS, GRID_ROWS } from "../hooks/use-office-camera";

/**
 * Presentational HUD chrome for OfficeScene — the floating overlays that sit on
 * top of the canvas: zoom/search tools, view toggle, tile-info readout, build
 * action bar, and map save/load status. Pure props in, no editing state; the
 * scene owns all state and passes it down. Kept out of office-scene.tsx so that
 * file reads as a controller, not a wall of JSX.
 */

type AgentMatch = { key: string; x: number; y: number; name: string };

// Live FPS readout — rAF loop, updates the label ~4×/sec to avoid re-render spam.
export function FpsCounter() {
  const [fps, setFps] = useState(0);
  useEffect(() => {
    let raf = 0;
    let frames = 0;
    let last = performance.now();
    const loop = (now: number) => {
      frames++;
      if (now - last >= 250) {
        setFps(Math.round((frames * 1000) / (now - last)));
        frames = 0;
        last = now;
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);
  const color = fps >= 50 ? "#7fd88a" : fps >= 30 ? "#e0c060" : "#e0705a";
  return (
    <div
      className="font-mono text-[11px] px-[6px] py-[2px] tabular-nums select-none"
      style={{ color }}
      title="Frames per second"
      aria-label={`${fps} frames per second`}
    >
      {fps} fps
    </div>
  );
}

// Top-left: zoom + recenter + agent search (hidden in build mode)
export function CanvasToolsBar({
  show,
  zoom,
  zoomBy,
  resetCamera,
  focusOn,
  agentSearch,
  setAgentSearch,
  searchOpen,
  setSearchOpen,
  searchMatches,
  zoomStep,
  fpsEnabled,
}: {
  show: boolean;
  zoom: number;
  zoomBy: (factor: number) => void;
  resetCamera: () => void;
  focusOn: (x: number, y: number, zoom?: number) => void;
  agentSearch: string;
  setAgentSearch: Dispatch<SetStateAction<string>>;
  searchOpen: boolean;
  setSearchOpen: Dispatch<SetStateAction<boolean>>;
  searchMatches: AgentMatch[];
  zoomStep: number;
  fpsEnabled: boolean;
}) {
  return (
    <AnimatePresence initial={false}>
      {show && (
        <motion.div
          key="canvas-tools"
          className="canvas-tools absolute flex items-center gap-[4px] z-[10] pointer-events-auto top-[16px] left-[16px] surface-sheen rounded-[15px] shadow-[var(--lift)] p-[5px]"
          initial={{ opacity: 0, scale: 0.85, x: -6, y: -6 }}
          animate={{ opacity: 1, scale: 1, x: 0, y: 0, transition: { type: "spring", stiffness: 300, damping: 26 } }}
          exit={{ opacity: 0, scale: 0.8, x: -6, y: -6, transition: { duration: 0.13, ease: "easeIn", delay: 0.04 } }}
        >
          <button
            type="button"
            className="w-[30px] h-[30px] flex items-center justify-center rounded-[10px] text-txt-3 transition-colors duration-150 hover:bg-card-2 hover:text-txt"
            onClick={() => zoomBy(1 - zoomStep)}
            aria-label="Zoom out"
          >
            <Icon name="minus" size={14} />
          </button>
          <div
            className="text-center cursor-pointer min-w-[46px] font-mono text-[11.5px] font-bold text-txt-2 hover:text-txt"
            onClick={resetCamera}
            title="Reset camera"
            role="button"
            tabIndex={0}
            onKeyDown={(e) => { if (e.key === "Enter") resetCamera(); }}
          >
            {Math.round(zoom * 100)}%
          </div>
          <button
            type="button"
            className="w-[30px] h-[30px] flex items-center justify-center rounded-[10px] text-txt-3 transition-colors duration-150 hover:bg-card-2 hover:text-txt"
            onClick={() => zoomBy(1 + zoomStep)}
            aria-label="Zoom in"
          >
            <Icon name="plus" size={14} />
          </button>
          <button
            type="button"
            className="w-[30px] h-[30px] flex items-center justify-center rounded-[10px] text-txt-3 transition-colors duration-150 hover:bg-card-2 hover:text-txt"
            title="Recenter"
            onClick={resetCamera}
          >
            <Icon name="crosshair" size={14} />
          </button>
          <div className="shrink-0 w-[1px] h-[20px] bg-edge mx-[3px]" />
          <div className="relative flex items-center gap-[8px] pl-[4px] pr-[12px]">
            <Icon name="search" size={12} className="text-txt-4 shrink-0" />
            <input
              className="bg-transparent border-none outline-none text-txt text-[11.5px] w-[110px] py-[2px] placeholder:text-txt-4"
              type="search"
              placeholder="Find agent…"
              value={agentSearch}
              onChange={(e) => { setAgentSearch(e.target.value); setSearchOpen(true); }}
              onFocus={() => setSearchOpen(true)}
              onBlur={() => setTimeout(() => setSearchOpen(false), 120)}
              aria-label="Search agents"
            />
            {searchOpen && searchMatches.length > 0 && (
              <div className="absolute left-0 top-[calc(100%+8px)] min-w-[190px] max-h-[240px] overflow-y-auto surface-sheen rounded-[13px] p-[6px] shadow-[var(--lift)] [scrollbar-width:thin]">
                {searchMatches.map((m) => (
                  <button
                    key={m.key}
                    type="button"
                    className="w-full flex items-center gap-[8px] text-left px-[9px] py-[7px] rounded-[9px] text-txt-2 font-mono text-[11.5px] transition-colors duration-150 hover:bg-card-2 hover:text-txt"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => { focusOn(m.x, m.y, 0.75); setSearchOpen(false); }}
                  >
                    <span className="w-[6px] h-[6px] rounded-full bg-red shrink-0" />
                    <span className="truncate">{m.name}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          {fpsEnabled && (
            <>
              <div className="shrink-0 w-[1px] h-[20px] bg-edge mx-[3px]" />
              <FpsCounter />
            </>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// Build-mode FPS badge — replaces the canvas-tools bar's FPS readout, which
// hides in build mode.
export function BuildFpsBadge({ show }: { show: boolean }) {
  return (
    <AnimatePresence initial={false}>
      {show && (
        <motion.div
          key="build-fps"
          className="absolute z-[10] pointer-events-none flex items-center top-[14px] left-[14px] bg-[rgba(20,16,14,0.95)] border border-[rgba(255,240,230,0.12)] rounded-[8px] px-[6px] py-[3px]"
          initial={{ opacity: 0, scale: 0.85, x: -6, y: -6 }}
          animate={{ opacity: 1, scale: 1, x: 0, y: 0, transition: { type: "spring", stiffness: 300, damping: 26, delay: 0.16 } }}
          exit={{ opacity: 0, scale: 0.8, x: -6, y: -6, transition: { duration: 0.13, ease: "easeIn" } }}
        >
          <FpsCounter />
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// Bottom-left: hover tile coords + map stats (hidden in build mode)
export function CanvasInfoBar({
  show,
  hoverTile,
  placed,
}: {
  show: boolean;
  hoverTile: { x: number; y: number } | null;
  placed: number;
}) {
  const t = useTranslations("office_scene_hud");
  return (
    <AnimatePresence initial={false}>
      {show && (
        <motion.div
          key="canvas-info"
          className="canvas-info absolute flex items-center z-[10] pointer-events-none bottom-[16px] left-[16px] py-[9px] px-[4px] surface-sheen rounded-[15px] shadow-[var(--lift)]"
          initial={{ opacity: 0, scale: 0.85, x: -6, y: 6 }}
          animate={{ opacity: 1, scale: 1, x: 0, y: 0, transition: { type: "spring", stiffness: 300, damping: 26, delay: 0.1 } }}
          exit={{ opacity: 0, scale: 0.8, x: -6, y: 6, transition: { duration: 0.13, ease: "easeIn", delay: 0.1 } }}
        >
          {[
            { label: t("tile"), value: hoverTile ? `${hoverTile.x}, ${hoverTile.y}` : "-" },
            { label: t("map"), value: `${GRID_COLS} × ${GRID_ROWS}` },
            { label: t("placed"), value: t("placed_count", { count: placed }) },
          ].map((item, i, arr) => (
            <div key={item.label} className={`px-[14px] leading-[1.3] ${i < arr.length - 1 ? "border-r border-edge" : ""}`}>
              <div className="text-[8.5px] font-extrabold tracking-[0.09em] uppercase text-txt-4 whitespace-nowrap">{item.label}</div>
              <div className="font-mono text-[11.5px] font-bold text-txt-2 mt-[2px] whitespace-nowrap">{item.value}</div>
            </div>
          ))}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// Map persistence status — save pill + blocking load-failure overlay. Server is
// the source of truth, so every state is surfaced (never silent).
export function MapSyncStatus({
  loadState,
  saveState,
  retrySave,
  retryLoad,
}: {
  loadState: "loading" | "loaded" | "error";
  saveState: "idle" | "dirty" | "saving" | "saved" | "error";
  retrySave: () => void;
  retryLoad: () => void;
}) {
  return (
    <>
      {loadState === "loaded" && saveState !== "idle" && (
        <div className="absolute right-3 top-3 z-40 flex items-center gap-2 rounded-full bg-[rgba(28,25,23,0.9)] px-3 py-1.5 text-[11px] shadow-md">
          {saveState === "saving" && <span className="text-[rgba(220,214,209,0.9)]">Saving…</span>}
          {saveState === "dirty" && <span className="text-[rgba(220,214,209,0.7)]">Unsaved changes…</span>}
          {saveState === "saved" && <span className="text-[rgba(150,190,120,0.95)]">Saved</span>}
          {saveState === "error" && (
            <>
              <span className="text-[rgba(230,140,120,0.95)]">Save failed</span>
              <button
                onClick={retrySave}
                className="rounded bg-[rgba(255,255,255,0.1)] px-2 py-0.5 text-[10px] font-medium text-white hover:bg-[rgba(255,255,255,0.18)]"
              >
                Retry
              </button>
            </>
          )}
        </div>
      )}

      {/* Load failure — pause editing so a default/empty map can never overwrite
          good server data (the exact clobber that erased earlier progress). */}
      {loadState === "error" && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-[rgba(20,18,17,0.72)]">
          <div className="flex flex-col items-center gap-3 rounded-lg bg-[rgba(38,34,31,0.98)] px-6 py-5 text-center shadow-xl">
            <div className="text-[13px] font-medium text-[rgba(244,239,234,0.95)]">Couldn’t load your office from the server</div>
            <div className="max-w-[280px] text-[11px] leading-relaxed text-[rgba(200,193,187,0.8)]">
              Your saved map is safe on the server — editing is paused so nothing gets overwritten. Make sure the app
              is running, then retry.
            </div>
            <button
              onClick={retryLoad}
              className="rounded-md bg-[rgba(120,160,90,0.9)] px-4 py-1.5 text-[12px] font-medium text-white hover:bg-[rgba(120,160,90,1)]"
            >
              Retry
            </button>
          </div>
        </div>
      )}
    </>
  );
}
