"use client";

import { useEffect, useRef, useState } from "react";
import { Application, Container } from "pixi.js";
import { TILE, type AgentPositions } from "../components/office-map";
import type { DecorationsMap } from "../components/decorations";
import type { GrassColor } from "../components/grass-colors";
import type { OfficeAgent } from "./use-office-agents";
import type { AgentInstance } from "@agent-office/domain/types";
import { buildStaticLayers, DECO_LAYER_LABEL } from "../pixi/build-static-layers";
import { buildAgentLayer } from "../pixi/build-agent-layer";
import { GLOW_AMBER, GLOW_RED, setGlowColor, type AgentContainerExtras } from "../pixi/glow";

// The "water" behind the map (.office-scene backgroundColor). Pixi clears to a
// transparent framebuffer everywhere else so this shows through empty areas.
const WATER_COLOR = 0x47aca9;

// WebKitGTK (Tauri on Linux) mis-composites a transparent WebGL framebuffer:
// it multiplies the whole canvas — including opaque tiles — down to near-zero
// alpha, leaving a near-blank map (faint stripes) that renders fine in
// Chromium / WKWebView / WebView2. Giving the renderer an OPAQUE clear color
// equal to the water color dodges the bug with zero visual change. Gated so
// other platforms keep the transparent canvas (and any future water shader).
const isWebKitGTK =
  typeof window !== "undefined" &&
  "__TAURI_INTERNALS__" in window &&
  /Linux/.test(navigator.userAgent);

export interface OfficePixiProps {
  width: number;
  height: number;
  // Camera — controlled by parent (useOfficeCamera). Pixi applies these each
  // render; all pan/zoom interaction is handled by the outer React container.
  panX: number;
  panY: number;
  zoom: number;
  grid: boolean[][];
  decorations: DecorationsMap;
  grassColor: GrassColor;
  // Agent rendering
  agentPositions: AgentPositions;
  agentsById: Map<string, OfficeAgent>;
  agentSearch?: string;
  isMultiInstance?: boolean;
  rosterInstances?: AgentInstance[];
  spendByInstance?: Record<string, number>;
  // "x,y" of the hovered agent tile → glow that sprite. null = none.
  hoveredAgentKey?: string | null;
  // "x,y:layer" of the hovered decoration instance (select tool) → glow it.
  hoveredDecoKey?: string | null;
}

/**
 * Owns the imperative PixiJS lifecycle for the office canvas: app init, camera
 * sync, static/agent layer rebuilds, and the hover/search glow ticker. Returns
 * the container ref the component renders. All non-JSX logic lives here so the
 * component file stays markup-only.
 */
export function useOfficePixi({
  width,
  height,
  panX,
  panY,
  zoom,
  grid,
  decorations,
  grassColor,
  agentPositions,
  agentsById,
  agentSearch,
  isMultiInstance,
  rosterInstances,
  spendByInstance,
  hoveredAgentKey,
  hoveredDecoKey,
}: OfficePixiProps) {
  // Container div — the canvas is created imperatively so each effect invocation
  // gets its own fresh HTMLCanvasElement (and thus its own WebGL context). React
  // StrictMode double-invokes effects; sharing a canvas between two Application
  // instances would cause loseContext() called by the first app's destroy() to
  // silently kill the second app's GL context before it ever renders.
  const containerRef = useRef<HTMLDivElement>(null);
  const appRef = useRef<Application | null>(null);
  const worldRef = useRef<Container | null>(null);
  const staticContainerRef = useRef<Container | null>(null);
  const agentLayerRef = useRef<Container | null>(null);

  // Always-current camera props — written during render so async init callback
  // can read the latest values without stale closure over the mount-time props.
  const cameraPropsRef = useRef({ panX, panY, zoom });
  cameraPropsRef.current = { panX, panY, zoom };

  // Generation counters: incremented on each build call so a stale
  // async rebuild can detect it has been superseded and bail early.
  const buildGenRef = useRef(0);
  const agentBuildGenRef = useRef(0);
  // One shared ticker drives every foam sprite's frame (instead of N
  // AnimatedSprites each subscribing to the ticker). Cleared on each rebuild.
  const foamTickerRef = useRef<((t: { deltaTime: number }) => void) | null>(null);

  // Always-current hovered agent key, read by the glow ticker without
  // re-subscribing on every hover change.
  const hoveredKeyRef = useRef<string | null | undefined>(hoveredAgentKey);
  hoveredKeyRef.current = hoveredAgentKey;

  const hoveredDecoRef = useRef<string | null | undefined>(hoveredDecoKey);
  hoveredDecoRef.current = hoveredDecoKey;

  // Always-current lowercased search query, read by the glow ticker.
  const searchRef = useRef("");
  searchRef.current = (agentSearch ?? "").toLowerCase().trim();

  // Signals that the PixiJS app is ready to receive scene data
  const [ready, setReady] = useState(false);

  // ─── Mount: init PixiJS ───────────────────────────────────────────────────
  useEffect(() => {
    const div = containerRef.current;
    if (!div) return;

    // Fresh canvas per effect invocation — prevents GL context sharing between
    // the two Application instances created by React StrictMode's double-invoke.
    const canvas = document.createElement("canvas");
    div.appendChild(canvas);

    const app = new Application();
    appRef.current = app;
    let alive = true;
    let initDone = false;

    // Round DPR to the nearest integer so the canvas is always at an exact
    // integer physical-to-CSS ratio.  Fractional DPR (e.g. 1.25 on Wayland)
    // combined with image-rendering:pixelated (inherited from the container)
    // causes nearest-neighbour downscaling artifacts — horizontal teal stripes
    // visible in WebKitGTK (Tauri) but hidden by Chromium's sub-pixel blending.
    const resolution = Math.round(window.devicePixelRatio ?? 1) || 1;

    app
      .init({
        canvas,
        width,
        height,
        background: WATER_COLOR,
        backgroundAlpha: isWebKitGTK ? 1 : 0,
        antialias: false,
        resolution,
        autoDensity: true,
        // Snap all sprite screen positions to whole pixels so fractional zoom
        // values don't open 1px gaps between adjacent tiles (visible as teal
        // stripes on WebKitGTK which doesn't sub-pixel-blend like Chromium).
        roundPixels: true,
      })
      .then(() => {
        initDone = true;
        if (!alive) {
          // Cleanup ran before init resolved — destroy this app, remove its canvas.
          canvas.remove();
          app.destroy(false);
          return;
        }

        // autoDensity sets fixed pixel inline styles; replace with fluid sizing so
        // the canvas always fills its parent regardless of subsequent resizes.
        canvas.style.cssText = "position:absolute;top:0;left:0;width:100%;height:100%";

        const world = new Container();
        app.stage.addChild(world);

        // Apply the current camera immediately so tiles are visible on first paint.
        // The camera sync effect already fired (with worldRef still null) by the
        // time this async callback resolves, so we must set position here.
        const cam = cameraPropsRef.current;
        const snappedZoom = Math.round(cam.zoom * TILE) / TILE;
        world.position.set(Math.round(cam.panX), Math.round(cam.panY));
        world.scale.set(snappedZoom);

        worldRef.current = world;

        const staticContainer = new Container();
        const agentLayer = new Container();
        world.addChild(staticContainer, agentLayer);
        staticContainerRef.current = staticContainer;
        agentLayerRef.current = agentLayer;

        setReady(true);
      })
      .catch((err: unknown) => {
        canvas.remove();
        console.error("[PixiJS] init failed:", err);
      });

    return () => {
      alive = false;
      if (initDone) {
        // Init already completed — safe to destroy immediately.
        canvas.remove();
        app.destroy(false);
      }
      // else: init still in-flight; the .then() handler above will clean up
      // once it resolves (alive=false check → canvas.remove + app.destroy).
      appRef.current = null;
      worldRef.current = null;
      staticContainerRef.current = null;
      agentLayerRef.current = null;
      foamTickerRef.current = null;
      setReady(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // mount once only

  // ─── Resize ───────────────────────────────────────────────────────────────
  useEffect(() => {
    const app = appRef.current;
    if (!app?.renderer) return;
    app.renderer.resize(width, height);
  }, [width, height]);

  // ─── Camera sync: apply pan/zoom from useOfficeCamera to the Pixi world ───
  useEffect(() => {
    const world = worldRef.current;
    if (!world) return;
    // Snap zoom so TILE × zoom is a whole number: every tile boundary lands on
    // an exact integer screen pixel regardless of the fractional pan offset.
    // Without this, 64 × 0.46 = 29.44 → tiles alternate 29/30px wide, opening
    // 1-pixel gaps that show the teal background as horizontal stripes in
    // WebKitGTK (which doesn't sub-pixel-blend like Chromium).
    const snappedZoom = Math.round(zoom * TILE) / TILE;
    world.position.set(Math.round(panX), Math.round(panY));
    world.scale.set(snappedZoom);
  }, [panX, panY, zoom]);

  // ─── Static layers build: runs whenever terrain/deco/grass data changes ──
  useEffect(() => {
    if (!ready) return;
    const sc = staticContainerRef.current;
    if (!sc) return;

    const gen = ++buildGenRef.current;
    const app = appRef.current;
    if (!app) return;
    buildStaticLayers(sc, app, foamTickerRef, grid, decorations, grassColor, gen, buildGenRef).catch(
      (err: unknown) => {
        console.error("[PixiJS] static layer build failed:", err);
      },
    );
  }, [ready, grid, decorations, grassColor]);

  // ─── Agent layer build: runs whenever agent data or terrain changes ────────
  useEffect(() => {
    if (!ready) return;
    const al = agentLayerRef.current;
    if (!al) return;

    const gen = ++agentBuildGenRef.current;
    buildAgentLayer(
      al,
      agentPositions,
      agentsById,
      grid,
      decorations,
      isMultiInstance ?? false,
      rosterInstances ?? [],
      spendByInstance ?? {},
      gen,
      agentBuildGenRef,
    ).catch((err: unknown) => {
      console.error("[PixiJS] agent layer build failed:", err);
    });
  }, [
    ready,
    agentPositions,
    agentsById,
    grid,
    decorations,
    isMultiInstance,
    rosterInstances,
    spendByInstance,
  ]);

  // ─── Hover glow: one persistent ticker toggles/syncs glows each frame ──────
  // Re-queries children every frame so it survives async agent rebuilds without
  // racing them. Cost is a short loop over agent containers per frame.
  useEffect(() => {
    if (!ready) return;
    const app = appRef.current;
    if (!app) return;
    const tick = () => {
      const al = agentLayerRef.current;
      if (!al) return;
      const key = hoveredKeyRef.current;
      const query = searchRef.current;
      for (const child of al.children) {
        const c = child as Container & AgentContainerExtras;
        if (!c.__glow || !c.__cm) continue;
        const hover = c.label === key;
        const match = query !== "" && (c.__name?.includes(query) ?? false);
        // Hover wins (amber); otherwise a search match glows red.
        if (hover) {
          setGlowColor(c.__cm, GLOW_AMBER);
          c.__glow.visible = true;
        } else if (match) {
          setGlowColor(c.__cm, GLOW_RED);
          c.__glow.visible = true;
        } else {
          c.__glow.visible = false;
        }
        if (c.__glow.visible && c.__main) c.__glow.texture = c.__main.texture;
        // Spotlight: dim non-matches while a query is active.
        c.alpha = query !== "" && !match && !hover ? 0.25 : 1;
      }

      // Decoration hover glow (select tool) — same amber silhouette as agents.
      const sc = staticContainerRef.current;
      const decoKey = hoveredDecoRef.current;
      const decoLayer = sc?.children.find((ch) => ch.label === DECO_LAYER_LABEL) as Container | undefined;
      if (decoLayer) {
        for (const child of decoLayer.children) {
          const c = child as Container & AgentContainerExtras;
          if (!c.__glow) continue;
          c.__glow.visible = c.label === decoKey;
        }
      }
    };
    app.ticker.add(tick);
    // `app.ticker` becomes null once `app.destroy()` runs. On unmount the mount
    // effect's cleanup (declared earlier) destroys the app before this cleanup
    // fires, so guard against the null ticker to avoid a navigation-time crash.
    return () => { app.ticker?.remove(tick); };
  }, [ready]);

  return { containerRef };
}
