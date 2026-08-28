"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { TILE, type AgentPositions, type VisibleRange } from "./office-map";
import { OfficeMapOverlay } from "./office-map-overlay";
import { OfficePixiCanvas } from "./office-pixi-canvas";
import { OfficeBuildToolbar, type BuildTool, type LandGenParams } from "./office-build-toolbar";
import { generateLand } from "../derive/land-generator";
import {
  DECORATIONS,
  decorationKey,
  footprintCenterShift,
  type DecorationsMap,
} from "./decorations";
import { DecoSelectMenu } from "./deco-select-menu";
import { AgentSelectMenu } from "./agent-select-menu";
import {
  CanvasToolsBar,
  BuildFpsBadge,
  CanvasInfoBar,
  MapSyncStatus,
} from "./office-scene-hud";
import { useCanvasEditing } from "../hooks/use-canvas-editing";
import { useOfficeAgents } from "../hooks/use-office-agents";
import { useOfficeStore } from "../hooks/use-office-store";
import { dragRefKey, type DragRef } from "../hooks/use-office-drag";
import { useOfficeMapSync } from "../hooks/use-office-map-sync";
import { patchUiSettings } from "@/lib/api/ui-settings";
import { useOfficeKeyboardShortcuts } from "../hooks/use-office-keyboard-shortcuts";
import { useProject } from "@/modules/projects/hooks/use-projects";
import { useSettings } from "@/modules/settings/hooks/use-settings";
import { useProjectSpend } from "@/modules/projects/hooks/use-project-spend";
import { useFpsMeterStore } from "@/lib/fps-meter-store";
import {
  DEFAULT_GRASS_COLOR,
  type GrassColor,
} from "./grass-colors";
import {
  useOfficeCamera,
  GRID_COLS,
  GRID_ROWS,
  ZOOM_STEP,
} from "../hooks/use-office-camera";
import { useOfficePainting } from "../hooks/use-office-painting";
import {
  makeSeedGrid,
  type Snapshot,
  EMPTY_ROSTER,
  EMPTY_SPEND,
} from "../derive/office-scene-data";
import { createCellClickHandler } from "../derive/apply-cell-click";
import type { OfficeMap } from "../derive/office-map-storage";

/**
 * Canvas for the new game-asset-based office view. Owns the editable
 * tile grid + decorations map + builder UI state.
 *
 * Both grid and decorations persist to the server via /api/ui-settings so the
 * user's build survives refreshes. Decoration placement is gated by
 * terrain: land decorations (bush, rock, tree) only on grass cells,
 * water decorations (water rock, duck) only on water cells. Mismatched
 * clicks are no-ops so the user can tell the wrong tool is selected.
 *
 * Erase: removes a decoration first if one is present, otherwise clears
 * the terrain. Two clicks fully empty a decorated grass cell.
 *
 * The dense cell-click mutation engine lives in ../derive/apply-cell-click; the
 * floating HUD chrome (tools bar, view toggle, info, actions, save status) lives
 * in ./office-scene-hud. This file is the controller that wires them together.
 */
export function OfficeScene({
  projectId,
}: {
  projectId: string | null;
}) {
  // Server is the single source of truth: start from defaults, then the map
  // sync hook loads the real map from the server on mount (see below).
  const [grid, setGrid] = useState<boolean[][]>(() => makeSeedGrid());
  const [decorations, setDecorations] = useState<DecorationsMap>({});
  const [agentPositions, setAgentPositions] = useState<AgentPositions>({});
  const [buildMode, setBuildMode] = useState(false);
  const [tool, setTool] = useState<BuildTool | null>(null);
  const [grassColor, setGrassColor] = useState<GrassColor>(DEFAULT_GRASS_COLOR);
  const [sceneLoaded, setSceneLoaded] = useState(false);
  const [hoverTile, setHoverTile] = useState<{ x: number; y: number } | null>(null);
  const [hoveredAgentKey, setHoveredAgentKey] = useState<string | null>(null);
  const [hoveredDecoKey, setHoveredDecoKey] = useState<string | null>(null);
  const [pendingChanges, setPendingChanges] = useState(0);
  const [agentSearch, setAgentSearch] = useState("");
  const [useCustomMap, setUseCustomMap] = useState(false);
  const [containerSize, setContainerSize] = useState<{ w: number; h: number } | null>(null);
  // First corner of a shift-click rectangle selection (paint/erase tools only)
  const [rectStart, setRectStart] = useState<{ x: number; y: number } | null>(null);

  // Undo/redo session history (not server-synced, session-only)
  const undoStack = useRef<Snapshot[]>([]);
  const redoStack = useRef<Snapshot[]>([]);
  // Refs always reflect latest state so callbacks don't need them in deps.
  // Assigned during render (safe - refs are mutable, no re-render triggered).
  const currentStateRef = useRef<Snapshot>({ grid, decorations, agentPositions });
  currentStateRef.current = { grid, decorations, agentPositions };
  const rectStartRef = useRef<{ x: number; y: number } | null>(null);
  rectStartRef.current = rectStart;

  // Select-tool editing — decoration + agent selection state, all the menu /
  // keyboard mutations, and the keyboard wiring (see use-canvas-editing).
  const {
    selectedDeco, setSelectedDeco, selectedAgent, setSelectedAgent, arrowMode, setArrowMode,
    rotateSelected, flipSelected, colorSelected, restackSelected,
    deleteSelected, selectDeco, deselectDeco, beginDecoDrag, setDecoOffset,
    resetDecoOffset,
    flipAgent, restackAgent, selectAgentInstance, beginAgentDrag,
    setAgentOffset, resetAgentOffset,
  } = useCanvasEditing({
    tool, buildMode, setDecorations, setAgentPositions,
    currentStateRef, undoStack, redoStack, setPendingChanges,
  });

  const {
    zoom, panX, panY,
    containerRef,
    zoomRef,
    panRef,
    onPointerDown: camPointerDown,
    onPointerMove: camPointerMove,
    onPointerUp: camPointerUp,
    zoomBy,
    resetCamera,
    focusOn,
  } = useOfficeCamera();

  const {
    buildModeRef,
    toolRef,
    onCellClickRef,
    onPointerDown: paintPointerDown,
    onPointerMove: paintPointerMove,
    onPointerUp: paintPointerUp,
  } = useOfficePainting({ panRef, zoomRef });

  // Dev instrument: the in-canvas FPS readouts show only when the FPS meter is
  // toggled on in the dev menu.
  const fpsEnabled = useFpsMeterStore((s) => s.enabled);

  // Sync painting refs with React state
  useEffect(() => { buildModeRef.current = buildMode; }, [buildMode, buildModeRef]);
  useEffect(() => { toolRef.current = tool; }, [tool, toolRef]);

  // HUD counters — memoized so grid.flat() doesn't run on every pointer-move render
  const grassCount = useMemo(() => grid.flat().filter(Boolean).length, [grid]);
  const decoCount = useMemo(
    () => Object.values(decorations).reduce((s, stack) => s + (stack?.length ?? 0), 0),
    [decorations],
  );

  // Track container size for viewport culling
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const { width, height } = entries[0]!.contentRect;
      setContainerSize({ w: width, h: height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [containerRef]);

  // Visible cell range — only cells within this bounding box are rendered.
  // Falls back to full grid until the ResizeObserver fires. The ref gives
  // useMemo a stable object to return when computed tile indices are unchanged,
  // so OfficeMap (memo'd) skips re-rendering on every pan pointer event.
  const prevVisibleRangeRef = useRef<VisibleRange>({ xMin: 0, xMax: GRID_COLS - 1, yMin: 0, yMax: GRID_ROWS - 1 });
  const visibleCellRange = useMemo<VisibleRange>(() => {
    if (!containerSize) return prevVisibleRangeRef.current;
    const OVERSCAN = 2;
    const xMin = Math.max(0, Math.floor(-panX / zoom / TILE) - OVERSCAN);
    const xMax = Math.min(GRID_COLS - 1, Math.ceil((-panX + containerSize.w) / zoom / TILE) + OVERSCAN);
    const yMin = Math.max(0, Math.floor(-panY / zoom / TILE) - OVERSCAN);
    const yMax = Math.min(GRID_ROWS - 1, Math.ceil((-panY + containerSize.h) / zoom / TILE) + OVERSCAN);
    const prev = prevVisibleRangeRef.current;
    if (prev.xMin === xMin && prev.xMax === xMax && prev.yMin === yMin && prev.yMax === yMax) return prev;
    const next: VisibleRange = { xMin, xMax, yMin, yMax };
    prevVisibleRangeRef.current = next;
    return next;
  }, [panX, panY, zoom, containerSize]);

  // Load + persist the map. Server is the single source of truth; the hook
  // loads on mount, atomically saves every edit (debounced + periodic + on tab
  // close), and surfaces load/save status so failures are never silent.
  const applyMap = useCallback((m: OfficeMap) => {
    setGrid(m.grid);
    setDecorations(m.decorations);
    setGrassColor(m.grassColor);
    setAgentPositions(m.agentPositions);
  }, []);
  const {
    loadState,
    saveState,
    retryLoad,
    retrySave,
  } = useOfficeMapSync({
    projectId,
    custom: useCustomMap,
    grid,
    decorations,
    grassColor,
    agentPositions,
    apply: applyMap,
    onLoaded: () => setSceneLoaded(true),
    setCustom: setUseCustomMap,
  });

  const { agents } = useOfficeAgents();
  const agentsById = useMemo(() => {
    const m = new Map<string, (typeof agents)[number]>();
    for (const a of agents) m.set(a.id, a);
    return m;
  }, [agents]);

  // Elastic agent search → dropdown of matching placed agents.
  const [searchOpen, setSearchOpen] = useState(false);
  const searchMatches = useMemo(() => {
    const q = agentSearch.toLowerCase().trim();
    if (!q) return [] as { key: string; x: number; y: number; name: string }[];
    const out: { key: string; x: number; y: number; name: string }[] = [];
    for (const [key, ref] of Object.entries(agentPositions)) {
      const agent = agentsById.get(ref.agentId);
      if (!agent || !agent.name.toLowerCase().includes(q)) continue;
      const [xs, ys] = key.split(",");
      out.push({ key, x: Number(xs), y: Number(ys), name: agent.name });
    }
    return out.slice(0, 8);
  }, [agentSearch, agentPositions, agentsById]);

  // Multi-instance data: roster + feature flag + spend
  const settingsQ = useSettings();
  const isMultiInstance = settingsQ.data?.features?.multiInstance === true;
  const projectQ = useProject(projectId);
  const rosterInstances = projectQ.data?.meta.roster ?? EMPTY_ROSTER;
  const spendQ = useProjectSpend(isMultiInstance ? projectId : null);
  const spendByInstance = spendQ.data?.byInstance ?? EMPTY_SPEND;

  // Prune agentPositions entries whose agent no longer exists.
  useEffect(() => {
    if (!sceneLoaded) return;
    setAgentPositions((prev) => {
      const stale = Object.keys(prev).filter((k) => !agentsById.has(prev[k]!.agentId));
      if (stale.length === 0) return prev;
      const next = { ...prev };
      for (const k of stale) delete next[k];
      return next;
    });
  }, [agentsById, sceneLoaded]);

  // Clear rectStart when the user switches tools
  useEffect(() => { setRectStart(null); }, [tool]);

  // Cell-click mutation engine — reads all live state through refs, so it's
  // stable forever and never breaks OfficeMap's memo. See apply-cell-click.
  const onCellClick = useMemo(
    () =>
      createCellClickHandler({
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
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [], // stable forever — all state is read through refs
  );

  // Keep ref in sync so pointer handlers can call the latest version
  useEffect(() => { onCellClickRef.current = onCellClick; }, [onCellClick, onCellClickRef]);

  // rAF throttle state for the hover-tile HUD update
  const pointerRafRef = useRef<number | null>(null);
  const lastHoverTileRef = useRef<{ x: number; y: number } | null>(null);

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (paintPointerDown(e)) return;
      camPointerDown(e);
    },
    [paintPointerDown, camPointerDown],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!paintPointerMove(e)) camPointerMove(e);

      // Defer the HUD tile-coordinate update to rAF to avoid a
      // getBoundingClientRect() forced-layout on every pointer event.
      if (pointerRafRef.current !== null) return;
      const clientX = e.clientX;
      const clientY = e.clientY;
      const el = e.currentTarget as HTMLElement;
      pointerRafRef.current = requestAnimationFrame(() => {
        pointerRafRef.current = null;
        // Guard: element may have been unmounted between the pointermove and this
        // rAF callback. getBoundingClientRect() returns a zeroed rect for detached
        // elements, producing out-of-bounds tile coordinates.
        if (!el.isConnected) return;
        const rect = el.getBoundingClientRect();
        const wx = (clientX - rect.left - panRef.current.x) / zoomRef.current;
        const wy = (clientY - rect.top - panRef.current.y) / zoomRef.current;
        const tx = Math.floor(wx / TILE);
        const ty = Math.floor(wy / TILE);
        const inBounds = tx >= 0 && tx < GRID_COLS && ty >= 0 && ty < GRID_ROWS;
        const newTile = inBounds ? { x: tx, y: ty } : null;
        const last = lastHoverTileRef.current;
        if (newTile?.x === last?.x && newTile?.y === last?.y) return;
        lastHoverTileRef.current = newTile;
        setHoverTile(newTile);
      });
    },
    [paintPointerMove, camPointerMove, panRef, zoomRef],
  );

  const onPointerUp = useCallback(() => {
    paintPointerUp();
    camPointerUp();
    if (pointerRafRef.current !== null) {
      cancelAnimationFrame(pointerRafRef.current);
      pointerRafRef.current = null;
    }
  }, [paintPointerUp, camPointerUp]);

  const onBuildToggle = useCallback(() => {
    setBuildMode((m) => {
      if (!m) { setAgentSearch(""); setTool("select"); } // entering build mode → select active
      return !m;
    });
    setPendingChanges(0);
  }, []);

  // Toolbar undo/redo/reset — same stacks the keyboard shortcuts use.
  const onUndo = useCallback(() => {
    const snapshot = undoStack.current.pop();
    if (!snapshot) return;
    redoStack.current.push(currentStateRef.current);
    setGrid(snapshot.grid);
    setDecorations(snapshot.decorations);
    setAgentPositions(snapshot.agentPositions);
    setRectStart(null);
    setPendingChanges((n) => n + 1);
  }, []);

  const onRedo = useCallback(() => {
    const snapshot = redoStack.current.pop();
    if (!snapshot) return;
    undoStack.current.push(currentStateRef.current);
    setGrid(snapshot.grid);
    setDecorations(snapshot.decorations);
    setAgentPositions(snapshot.agentPositions);
    setRectStart(null);
    setPendingChanges((n) => n + 1);
  }, []);

  const onResetCanvas = useCallback(() => {
    if (!window.confirm("Reset the canvas? This clears all decorations and placed agents and fills the map with grass.")) return;
    undoStack.current = [...undoStack.current.slice(-49), currentStateRef.current];
    redoStack.current = [];
    setGrid(Array.from({ length: GRID_ROWS }, () => Array.from({ length: GRID_COLS }, () => true)));
    setDecorations({});
    setAgentPositions({});
    setRectStart(null);
    setPendingChanges((n) => n + 1);
  }, []);

  const onGenerateLand = useCallback((opts: LandGenParams) => {
    const { grid, decorations, agentPositions } = currentStateRef.current;
    undoStack.current = [...undoStack.current.slice(-49), { grid, decorations, agentPositions }];
    redoStack.current = [];
    setGrid(generateLand({ ...opts, cols: GRID_COLS, rows: GRID_ROWS }));
    setRectStart(null);
    setPendingChanges((n) => n + 1);
  }, []);

  const onAgentDrop = useCallback((x: number, y: number, ref: DragRef) => {
    setAgentPositions((prev) => {
      const next: AgentPositions = {};
      const refK = dragRefKey(ref);
      for (const [k, v] of Object.entries(prev)) {
        if (dragRefKey(v) === refK) continue;
        next[k] = v;
      }
      next[decorationKey(x, y)] = ref;
      return next;
    });
  }, []);

  // Fork the current global map into project-specific keys so the user can
  // independently customise the layout for this project.
  const enableCustomMap = useCallback(() => {
    if (!projectId) return;
    setUseCustomMap(true);
    // Persist the flag; the save effects will fork current state to project keys.
    patchUiSettings({ [`office-map-custom:${projectId}`]: "true" }).catch(() => {});
  }, [projectId]);

  // Revert back to the shared global map layout for this project. Persist the
  // flag; the sync hook sees `useCustomMap` flip to false and reloads the shared
  // scope from the server.
  const disableCustomMap = useCallback(() => {
    if (!projectId) return;
    setUseCustomMap(false);
    patchUiSettings({ [`office-map-custom:${projectId}`]: "false" }).catch(() => {});
  }, [projectId]);

  const selectAgent = useOfficeStore((s) => s.select);
  const onAgentClick = useCallback(
    (x: number, y: number, ref: DragRef) => {
      if (buildMode && tool === "erase") {
        setAgentPositions((prev) => {
          const next = { ...prev };
          delete next[decorationKey(x, y)];
          return next;
        });
        return;
      }
      // Select tool edits the agent in place (handled via onAgentSelect) — never
      // open the conversation while editing the layout.
      if (buildMode && tool === "select") return;
      selectAgent(ref.agentId, { instanceId: ref.instanceId ?? null });
    },
    [buildMode, tool, selectAgent],
  );

  // Keyboard shortcuts for build mode: tool selection (B/E/F), Escape to exit,
  // and Cmd/Ctrl+Z / Cmd/Ctrl+Shift+Z for undo/redo.
  useOfficeKeyboardShortcuts({
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
  });

  // Match the PixiJS world's pixel-snapping (see use-office-pixi camera sync) so
  // the DOM interaction overlay — ghost preview, hover tint, select hit-targets,
  // select menus — lines up exactly with the rendered sprites instead of drifting
  // by the sub-pixel rounding the pixi camera applies.
  const snapPanX = Math.round(panX);
  const snapPanY = Math.round(panY);
  const snapZoom = Math.round(zoom * TILE) / TILE;

  return (
    <div
      ref={containerRef}
      className="office-scene relative w-full h-full [image-rendering:pixelated] overflow-hidden cursor-default"
      style={{ backgroundColor: "#47aca9" }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    >
      {/* PixiJS visual layer — camera controlled via panX/panY/zoom props */}
      {containerSize && (
        <OfficePixiCanvas
          width={containerSize.w}
          height={containerSize.h}
          panX={panX}
          panY={panY}
          zoom={zoom}
          grid={grid}
          decorations={decorations}
          grassColor={grassColor}
          agentPositions={agentPositions}
          agentsById={agentsById}
          agentSearch={agentSearch}
          isMultiInstance={isMultiInstance}
          rosterInstances={rosterInstances}
          spendByInstance={spendByInstance}
          hoveredAgentKey={hoveredAgentKey}
          hoveredDecoKey={hoveredDecoKey}
        />
      )}
      {/* Interaction overlay — same world transform, handles build mode + agent clicks */}
      <div
        className="absolute left-0 top-0 origin-top-left pointer-events-none"
        style={{
          width: GRID_COLS * TILE,
          height: GRID_ROWS * TILE,
          transform: `translate(${snapPanX}px, ${snapPanY}px) scale(${snapZoom})`,
        }}
      >
        <OfficeMapOverlay
          grid={grid}
          decorations={decorations}
          agentPositions={agentPositions}
          agentsById={agentsById}
          buildMode={buildMode}
          tool={tool}
          visibleRange={visibleCellRange}
          onCellClick={onCellClick}
          onAgentClick={onAgentClick}
          onAgentDrop={onAgentDrop}
          onAgentHoverChange={setHoveredAgentKey}
          selectedDeco={selectedDeco}
          onDecoSelect={selectDeco}
          onDecoDeselect={deselectDeco}
          onDecoHoverChange={setHoveredDecoKey}
          zoom={zoom}
          onDecoDragStart={beginDecoDrag}
          onDecoOffset={setDecoOffset}
          selectedAgentKey={selectedAgent}
          onAgentSelect={selectAgentInstance}
          onAgentDragStart={beginAgentDrag}
          onAgentOffset={setAgentOffset}
        />
      </div>

      {/* Single selection menu — one dropdown anchored above the selected
          sprite (screen space, outside the zoomed overlay so it stays fixed). */}
      {buildMode && tool === "select" && selectedDeco && (() => {
        const inst = decorations[selectedDeco.key]?.[selectedDeco.index];
        if (!inst) return null;
        const [xs, ys] = selectedDeco.key.split(",");
        const cx = Number(xs);
        const cy = Number(ys);
        const def = DECORATIONS[inst.kind];
        const boxLeft = cx * TILE + (TILE - def.frameW) / 2 + footprintCenterShift(inst.kind) * TILE + (inst.dx ?? 0);
        const boxTop =
          (def.anchor === "center"
            ? cy * TILE + (TILE - def.frameH) / 2
            : (cy + 1) * TILE - def.frameH) + (inst.dy ?? 0);
        return (
          <DecoSelectMenu
            def={def}
            inst={inst}
            left={snapPanX + (boxLeft + def.frameW / 2) * snapZoom}
            top={snapPanY + boxTop * snapZoom}
            onRotate={rotateSelected}
            onMirror={flipSelected}
            moveMode={arrowMode}
            onMoveMode={setArrowMode}
            onReset={resetDecoOffset}
            onColor={colorSelected}
            onForward={() => restackSelected(1)}
            onBackward={() => restackSelected(-1)}
            onDelete={deleteSelected}
            onClose={() => setSelectedDeco(null)}
          />
        );
      })()}

      {/* Selected-agent menu — mirror / layer / nudge, anchored above the tile. */}
      {buildMode && tool === "select" && selectedAgent && (() => {
        const placement = agentPositions[selectedAgent];
        if (!placement) return null;
        const agent = agentsById.get(placement.agentId);
        if (!agent) return null;
        const [xs, ys] = selectedAgent.split(",");
        const cx = Number(xs);
        const cy = Number(ys);
        const anchorX = cx * TILE + TILE / 2 + (placement.dx ?? 0);
        const anchorY = cy * TILE - TILE * 0.6 + (placement.dy ?? 0);
        return (
          <AgentSelectMenu
            name={agent.name}
            flip={!!placement.flip}
            z={placement.z ?? 0}
            left={snapPanX + anchorX * snapZoom}
            top={snapPanY + anchorY * snapZoom}
            onMirror={flipAgent}
            moveMode={arrowMode}
            onMoveMode={setArrowMode}
            onReset={resetAgentOffset}
            onForward={() => restackAgent(1)}
            onBackward={() => restackAgent(-1)}
            onClose={() => setSelectedAgent(null)}
          />
        );
      })()}

      <CanvasToolsBar
        show={!buildMode}
        zoom={zoom}
        zoomBy={zoomBy}
        resetCamera={resetCamera}
        focusOn={focusOn}
        agentSearch={agentSearch}
        setAgentSearch={setAgentSearch}
        searchOpen={searchOpen}
        setSearchOpen={setSearchOpen}
        searchMatches={searchMatches}
        zoomStep={ZOOM_STEP}
        fpsEnabled={fpsEnabled}
      />

      <BuildFpsBadge show={buildMode && fpsEnabled} />

      <CanvasInfoBar show={!buildMode} hoverTile={hoverTile} placed={grassCount + decoCount} />

      <OfficeBuildToolbar
        active={buildMode}
        tool={tool}
        grassColor={grassColor}
        onToggle={onBuildToggle}
        onSelectTool={setTool}
        onSelectGrassColor={setGrassColor}
        canUndo={undoStack.current.length > 0}
        canRedo={redoStack.current.length > 0}
        onUndo={onUndo}
        onRedo={onRedo}
        onReset={onResetCanvas}
        onGenerateLand={onGenerateLand}
        pendingChanges={pendingChanges}
        onDone={() => { setBuildMode(false); setPendingChanges(0); undoStack.current = []; redoStack.current = []; }}
        projectId={projectId}
        useCustomMap={useCustomMap}
        enableCustomMap={enableCustomMap}
        disableCustomMap={disableCustomMap}
      />

      <MapSyncStatus
        loadState={loadState}
        saveState={saveState}
        retrySave={retrySave}
        retryLoad={retryLoad}
      />
    </div>
  );
}
