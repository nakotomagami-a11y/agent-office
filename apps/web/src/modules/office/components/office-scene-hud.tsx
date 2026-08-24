"use client";

import { useEffect, useState, type Dispatch, type SetStateAction } from "react";
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
          className="canvas-tools absolute flex items-center gap-[6px] z-[10] pointer-events-auto top-[14px] left-[14px] bg-[rgba(20,16,14,0.95)] border border-[rgba(255,240,230,0.12)] rounded-[8px] p-[4px]"
          initial={{ opacity: 0, scale: 0.85, x: -6, y: -6 }}
          animate={{ opacity: 1, scale: 1, x: 0, y: 0, transition: { type: "spring", stiffness: 300, damping: 26 } }}
          exit={{ opacity: 0, scale: 0.8, x: -6, y: -6, transition: { duration: 0.13, ease: "easeIn", delay: 0.04 } }}
        >
          <button
            type="button"
            className="inline-flex items-center gap-[4px] px-[8px] py-[5px] rounded-[5px] text-[rgba(199,191,183,0.9)] text-[11.5px] font-mono transition-[background,color] duration-100 hover:bg-[rgba(255,240,230,0.08)] hover:text-[#f4efea]"
            onClick={() => zoomBy(1 - zoomStep)}
            aria-label="Zoom out"
          >
            <Icon name="minus" size={11} />
          </button>
          <div
            className="text-center cursor-pointer px-[8px] py-[2px] text-[rgba(199,191,183,0.9)] font-mono text-[11px] min-w-[40px] hover:text-[#f4efea]"
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
            className="inline-flex items-center gap-[4px] px-[8px] py-[5px] rounded-[5px] text-[rgba(199,191,183,0.9)] text-[11.5px] font-mono transition-[background,color] duration-100 hover:bg-[rgba(255,240,230,0.08)] hover:text-[#f4efea]"
            onClick={() => zoomBy(1 + zoomStep)}
            aria-label="Zoom in"
          >
            <Icon name="plus" size={11} />
          </button>
          <div className="shrink-0 w-[1px] h-[16px] bg-[rgba(255,240,230,0.10)] mx-[2px]" />
          <button
            type="button"
            className="inline-flex items-center gap-[4px] px-[8px] py-[5px] rounded-[5px] text-[rgba(199,191,183,0.9)] text-[11.5px] font-mono transition-[background,color] duration-100 hover:bg-[rgba(255,240,230,0.08)] hover:text-[#f4efea]"
            title="Recenter"
            onClick={resetCamera}
          >
            <Icon name="crosshair" size={13} />
          </button>
          <div className="shrink-0 w-[1px] h-[16px] bg-[rgba(255,240,230,0.10)] mx-[2px]" />
          <div className="relative">
            <input
              className="bg-transparent border-none outline-none text-[rgba(199,191,183,0.9)] font-mono text-[11px] w-[110px] px-[4px] py-[2px] focus:text-[#f4efea] placeholder:text-[rgba(199,191,183,0.4)]"
              type="search"
              placeholder="Find agent…"
              value={agentSearch}
              onChange={(e) => { setAgentSearch(e.target.value); setSearchOpen(true); }}
              onFocus={() => setSearchOpen(true)}
              onBlur={() => setTimeout(() => setSearchOpen(false), 120)}
              aria-label="Search agents"
            />
            {searchOpen && searchMatches.length > 0 && (
              <div className="absolute left-0 top-[calc(100%+6px)] min-w-[180px] max-h-[240px] overflow-y-auto bg-[rgba(20,16,14,0.98)] border border-[rgba(255,240,230,0.12)] rounded-[8px] p-[4px] shadow-[var(--shadow-2)] [scrollbar-width:thin]">
                {searchMatches.map((m) => (
                  <button
                    key={m.key}
                    type="button"
                    className="w-full flex items-center gap-[7px] text-left px-[8px] py-[6px] rounded-[5px] text-[rgba(199,191,183,0.9)] font-mono text-[11.5px] transition-[background,color] duration-100 hover:bg-[rgba(233,84,32,0.14)] hover:text-[#f4efea]"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => { focusOn(m.x, m.y, 0.75); setSearchOpen(false); }}
                  >
                    <span className="w-[6px] h-[6px] rounded-full bg-[#ff2d1e] shrink-0" />
                    <span className="truncate">{m.name}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          {fpsEnabled && (
            <>
              <div className="shrink-0 w-[1px] h-[16px] bg-[rgba(255,240,230,0.10)] mx-[2px]" />
              <FpsCounter />
            </>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// Top-right: iso / cards view toggle (hidden in build mode)
export function ViewToggle({
  show,
  setView,
}: {
  show: boolean;
  setView: (view: "iso" | "cards") => void;
}) {
  return (
    <AnimatePresence initial={false}>
      {show && (
        <motion.div
          key="view-toggle"
          className="absolute flex items-center z-[10] pointer-events-auto top-[14px] right-[14px] bg-[rgba(20,16,14,0.95)] border border-[rgba(255,240,230,0.12)] rounded-[8px] p-[4px] gap-[2px]"
          initial={{ opacity: 0, scale: 0.85, x: 6, y: -6 }}
          animate={{ opacity: 1, scale: 1, x: 0, y: 0, transition: { type: "spring", stiffness: 300, damping: 26, delay: 0.05 } }}
          exit={{ opacity: 0, scale: 0.8, x: 6, y: -6, transition: { duration: 0.13, ease: "easeIn" } }}
        >
          <button
            type="button"
            className="inline-flex items-center gap-[4px] px-[8px] py-[5px] rounded-[5px] text-[11.5px] font-mono transition-[background,color] duration-100 bg-[rgba(255,240,230,0.12)] text-[#f4efea]"
            onClick={() => setView("iso")}
          >
            <Icon name="map" size={11} /> Iso
          </button>
          <button
            type="button"
            className="inline-flex items-center gap-[4px] px-[8px] py-[5px] rounded-[5px] text-[11.5px] font-mono transition-[background,color] duration-100 text-[rgba(199,191,183,0.9)] hover:bg-[rgba(255,240,230,0.08)] hover:text-[#f4efea]"
            onClick={() => setView("cards")}
          >
            <Icon name="grid" size={11} /> Cards
          </button>
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
  return (
    <AnimatePresence initial={false}>
      {show && (
        <motion.div
          key="canvas-info"
          className="canvas-info absolute flex z-[10] pointer-events-none bottom-[14px] left-[14px] gap-[14px] px-[12px] py-[8px] bg-[rgba(20,16,14,0.95)] border border-[rgba(255,240,230,0.12)] rounded-[8px] font-mono text-[10.5px] text-[rgba(138,128,121,0.9)]"
          initial={{ opacity: 0, scale: 0.85, x: -6, y: 6 }}
          animate={{ opacity: 1, scale: 1, x: 0, y: 0, transition: { type: "spring", stiffness: 300, damping: 26, delay: 0.1 } }}
          exit={{ opacity: 0, scale: 0.8, x: -6, y: 6, transition: { duration: 0.13, ease: "easeIn", delay: 0.1 } }}
        >
          <div className="item">
            <div className="uppercase tracking-[0.06em] text-[rgba(94,86,81,0.9)] text-[9.5px]">Tile</div>
            <div className="text-[rgba(244,239,234,0.9)]">{hoverTile ? `${hoverTile.x}, ${hoverTile.y}` : "-"}</div>
          </div>
          <div className="item">
            <div className="uppercase tracking-[0.06em] text-[rgba(94,86,81,0.9)] text-[9.5px]">Map</div>
            <div className="text-[rgba(244,239,234,0.9)]">{GRID_COLS} × {GRID_ROWS}</div>
          </div>
          <div className="item">
            <div className="uppercase tracking-[0.06em] text-[rgba(94,86,81,0.9)] text-[9.5px]">Placed</div>
            <div className="text-[rgba(244,239,234,0.9)]">{placed} tiles</div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// Bottom-center: build mode Done + layout scope toggle.
export function BuildActionsBar({
  show,
  pendingChanges,
  onDone,
  projectId,
  useCustomMap,
  enableCustomMap,
  disableCustomMap,
}: {
  show: boolean;
  pendingChanges: number;
  onDone: () => void;
  projectId: string | null;
  useCustomMap: boolean;
  enableCustomMap: () => void;
  disableCustomMap: () => void;
}) {
  return (
    <div className="absolute bottom-[14px] left-1/2 -translate-x-1/2 z-[15] pointer-events-none">
      <AnimatePresence>
        {show && (
          <motion.div
            key="done-bar"
            className="build-actions-bar flex items-center gap-[4px] pointer-events-auto whitespace-nowrap rounded-full p-[5px] bg-[rgba(26,22,20,0.97)] border border-[rgba(255,240,230,0.14)] shadow-[0_14px_40px_-10px_rgba(0,0,0,0.7)]"
            initial={{ opacity: 0, scale: 0.5, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0, transition: { type: "spring", stiffness: 360, damping: 28, delay: 0.32 } }}
            exit={{ opacity: 0, scale: 0.5, y: 20, transition: { duration: 0.12, ease: "easeIn" } }}
          >
            <button
              type="button"
              className="inline-flex items-center gap-[7px] rounded-full font-semibold px-[16px] py-[8px] text-[12.5px] transition-[background,color] duration-[120ms] bg-[rgba(255,240,230,0.08)] border border-[rgba(255,240,230,0.12)] text-[rgba(244,239,234,0.9)] hover:bg-[rgba(255,240,230,0.12)]"
              onClick={onDone}
            >
              {pendingChanges > 0 && <span className="rounded-full shrink-0 w-[6px] h-[6px] bg-[#e6b35a] shadow-[0_0_6px_#e6b35a]" />}
              <Icon name="check" size={13} />
              Done{pendingChanges > 0 ? ` · ${pendingChanges} saved` : ""}
            </button>
            {projectId && (
              <>
                <div className="shrink-0 w-[1px] h-[20px] bg-[rgba(255,240,230,0.10)] mx-[2px]" />
                <button
                  type="button"
                  className={`inline-flex items-center gap-[5px] rounded-full bg-transparent cursor-pointer font-medium text-[12px] px-[11px] py-[5px] border border-[rgba(255,240,230,0.15)] text-[rgba(255,240,230,0.55)] transition-[background,color,border-color] duration-100 hover:bg-[rgba(255,240,230,0.07)] hover:text-[rgba(255,240,230,0.8)]${useCustomMap ? " !border-[rgba(233,84,32,0.5)] !bg-[rgba(233,84,32,0.12)] !text-[#e95420]" : ""}`}
                  title={
                    useCustomMap
                      ? "Switch back to the default shared layout (used by all projects)"
                      : "Create a project-specific layout for this project"
                  }
                  onClick={useCustomMap ? disableCustomMap : enableCustomMap}
                >
                  <Icon name="map" size={12} />
                  {useCustomMap ? "Project layout" : "Default layout"}
                </button>
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
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
