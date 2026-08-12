import type { MutableRefObject } from "react";
import { AnimatedSprite, Application, Assets, Container, Rectangle, Sprite, Texture } from "pixi.js";
import { CompositeTilemap } from "@pixi/tilemap";
import { TILE, buildTiles, buildFoam } from "../components/office-map";
import {
  DECORATIONS,
  decoSrc,
  footprintCenterShift,
  type DecorationKind,
  type DecoInstance,
  type DecorationsMap,
} from "../components/decorations";
import { grassTilesetSrc, type GrassColor } from "../components/grass-colors";
import { raisedCells, elevatedTiles, wallTiles } from "./elevation";
import { BRIDGE_CAP_SRCS, FOAM_ANIM_SPEED, FOAM_FRAME, FOAM_FRAMES, FOAM_SHEET } from "./constants";
import { getPathTexture } from "./path/path-texture";
import { DEFAULT_PATH_MATERIAL } from "./path/materials";
import { makeGlow, type AgentContainerExtras } from "./glow";

// The deco layer is looked up by this label so the hover-glow ticker can toggle
// per-decoration glows (same amber silhouette used for agents).
export const DECO_LAYER_LABEL = "deco-layer";

// Decoration animation speed: frames / duration / 60fps
function decoAnimSpeed(kind: DecorationKind): number {
  const def = DECORATIONS[kind];
  if (def.frames <= 1 || !def.animClass) return 0;
  const match = def.animClass.match(/([\d.]+)s/);
  const duration = match ? parseFloat(match[1]!) : 1.6;
  const fps = def.frames / duration;
  return fps / 60;
}

// Builds the terrain/foam/decoration/bridge-cap layers into `staticContainer`.
// Async because textures load on demand; `gen`/`genRef` let a superseded build
// bail after the await. `foamTickerRef` holds the single shared foam ticker.
export async function buildStaticLayers(
  staticContainer: Container,
  app: Application,
  foamTickerRef: MutableRefObject<((t: { deltaTime: number }) => void) | null>,
  grid: boolean[][],
  decorations: DecorationsMap,
  grassColor: GrassColor,
  gen: number,
  genRef: MutableRefObject<number>,
): Promise<void> {
  // Drop the previous foam ticker before rebuilding its sprites. `app.ticker`
  // is null if the app was destroyed while a rebuild was in flight.
  if (foamTickerRef.current) {
    app.ticker?.remove(foamTickerRef.current);
    foamTickerRef.current = null;
  }
  // Destroy previous sub-containers (stops AnimatedSprite ticker subscriptions
  // and releases texture wrapper references via destroy({ children: true }))
  for (const child of staticContainer.removeChildren()) {
    (child as Container).destroy({ children: true });
  }

  // ── Collect all asset URLs to load ─────────────────────────────────────────
  const tilesetUrl = grassTilesetSrc(grassColor);
  const urls = new Set<string>([tilesetUrl, FOAM_SHEET]);

  // Collect unique decoration URLs that are actually used
  const usedKinds = new Set<DecorationKind>();
  for (const stack of Object.values(decorations)) {
    for (const inst of stack) usedKinds.add(inst.kind);
  }
  for (const kind of usedKinds) {
    const d = DECORATIONS[kind];
    if (d.family === "path") continue; // procedurally generated — no texture load
    urls.add(d.src);
    if (d.rotFrames) for (const f of d.rotFrames) urls.add(f);
  }
  // Faction-coloured building sprites resolve per-instance, so add the exact
  // recoloured URL each placed instance needs (blue reuses the base above).
  for (const stack of Object.values(decorations)) {
    for (const inst of stack) {
      if (DECORATIONS[inst.kind].family === "path") continue;
      urls.add(decoSrc(DECORATIONS[inst.kind], inst));
    }
  }

  // Bridge cap URLs (preload if any bridges exist)
  const hasBridges = [...usedKinds].some(
    (k) => k === "bridge_h" || k === "bridge_v",
  );
  if (hasBridges) {
    for (const src of Object.values(BRIDGE_CAP_SRCS)) urls.add(src);
  }

  // Batch-load all textures.
  // Force nearest-neighbour filtering on every source: pixel-art sprites
  // look correct with nearest, and it prevents bilinear sampling from
  // bleeding into adjacent tiles in sprite-sheet crops (which is what
  // causes "house roof" fragments to appear at neighbouring positions in
  // WebKitGTK — Chromium hides this with sub-pixel blending).
  const textureMap = new Map<string, Texture>();
  await Promise.all(
    [...urls].map(async (url) => {
      try {
        const tex = await Assets.load<Texture>(url);
        tex.source.scaleMode = "nearest";
        textureMap.set(url, tex);
      } catch (err) {
        console.warn("[PixiJS] failed to load texture:", url, err);
      }
    }),
  );

  // ── Stale-call guard: bail if a newer build was triggered while we awaited,
  //    or if the app was destroyed (navigation unmount). `app.renderer` is null
  //    after `app.destroy()`, so this prevents touching a dead ticker/stage. ──
  if (gen !== genRef.current || !app.renderer) return;

  // ── Create sub-containers ───────────────────────────────────────────────────
  // Terrain + foam render as batched tilemaps (≈one draw call each, no per-tile
  // scene nodes) so map size barely affects frame cost. Rare rotated grass caps
  // stay as Sprites; decorations/bridge caps remain sprites (sparse).
  const foamTilemap = new CompositeTilemap();
  const terrainTilemap = new CompositeTilemap();
  const rotatedTiles = new Container();
  // Paths render in their own layer beneath decorations/houses so they always
  // sit on the ground — the deco y-sort would otherwise draw a path on a lower
  // row in front of a building on a higher row.
  const pathLayer = new Container();
  const decoLayer = new Container();
  decoLayer.label = DECO_LAYER_LABEL;
  const capLayer = new Container();
  staticContainer.addChild(foamTilemap, terrainTilemap, rotatedTiles, pathLayer, decoLayer, capLayer);

  // ── Helper: create a cropped texture from a base texture ──────────────────
  function cropTexture(
    base: Texture,
    x: number,
    y: number,
    w: number,
    h: number,
  ): Texture {
    return new Texture({
      source: base.source,
      frame: new Rectangle(x, y, w, h),
    });
  }

  // ── Grass tiles ────────────────────────────────────────────────────────────
  // Cells lifted a tier (a "floor" decoration) get an elevated-grass overlay on
  // top of their ground grass and grow an auto-tiled stone cliff wall below.
  const raised = raisedCells(decorations);
  const tilesetTex = textureMap.get(tilesetUrl);
  if (tilesetTex) {
    const QUARTER = TILE / 2; // 32
    const placed = buildTiles(grid);
    for (const t of placed) {
      // Raised cells keep their opaque ground grass underneath (so the highland
      // overlay's scalloped fringe never reveals the background), then get the
      // elevated tile + cliff wall layered on top below.
      if (t.quarter) {
        // Half-tile: 32×32 quadrant of the source tile
        const qx = t.quarter === "tr" || t.quarter === "br" ? QUARTER : 0;
        const qy = t.quarter === "bl" || t.quarter === "br" ? QUARTER : 0;
        const tex = cropTexture(
          tilesetTex,
          t.c * TILE + qx,
          t.r * TILE + qy,
          QUARTER,
          QUARTER,
        );
        terrainTilemap.tile(tex, t.x * TILE + qx, t.y * TILE + qy);
      } else if (t.rotate === 90) {
        // Rare 1-wide horizontal grass cap — keep as a rotated Sprite (the
        // tilemap batches only the unrotated tiles, which is ~all of them).
        const tex = cropTexture(tilesetTex, t.c * TILE, t.r * TILE, TILE, TILE);
        const sprite = new Sprite(tex);
        sprite.rotation = Math.PI / 2;
        // Pivot compensation: after 90° CW rotation, the left edge moves to the
        // bottom. Shift right by TILE so the sprite stays in its cell.
        sprite.x = t.x * TILE + TILE;
        sprite.y = t.y * TILE;
        rotatedTiles.addChild(sprite);
      } else {
        const tex = cropTexture(tilesetTex, t.c * TILE, t.r * TILE, TILE, TILE);
        terrainTilemap.tile(tex, t.x * TILE, t.y * TILE);
      }
    }
    // Elevated-grass surface (auto-tiled → cohesive platform), then the cliff
    // walls hanging one tile below any south-exposed edge.
    for (const t of elevatedTiles(raised)) {
      const tex = cropTexture(tilesetTex, t.c * TILE, t.r * TILE, TILE, TILE);
      terrainTilemap.tile(tex, t.x * TILE, t.y * TILE);
    }
    for (const t of wallTiles(raised)) {
      const tex = cropTexture(tilesetTex, t.c * TILE, t.r * TILE, TILE, TILE);
      terrainTilemap.tile(tex, t.x * TILE, t.y * TILE);
    }
  }

  // ── Foam layer ─────────────────────────────────────────────────────────────
  const foamBaseTex = textureMap.get(FOAM_SHEET);
  if (foamBaseTex) {
    // Frame-0 crop; the tilemap animates every foam tile by stepping animX along
    // the sheet, so a single tileAnim update per tick drives them all.
    const foamFrame0 = cropTexture(foamBaseTex, 0, 0, FOAM_FRAME, FOAM_FRAME);
    const foamCells = buildFoam(grid);
    for (const { x, y } of foamCells) {
      // Same offset as CSS: x*TILE - TILE to centre the 3×3 foam frame on the cell
      foamTilemap.tile(foamFrame0, x * TILE - TILE, y * TILE - TILE, {
        animX: FOAM_FRAME,
        animCountX: FOAM_FRAMES,
      });
    }
    if (foamCells.length > 0) {
      let frame = 0;
      let acc = 0;
      const tick = (ticker: { deltaTime: number }) => {
        acc += FOAM_ANIM_SPEED * ticker.deltaTime;
        if (acc < 1) return;
        acc -= 1;
        frame = (frame + 1) % FOAM_FRAMES;
        // tileAnim defaults to null; assign a fresh array (the pipe reads it as
        // `parent.tileAnim || [0,0]`). Mutating null throws and halts the render
        // loop — which froze the whole canvas, camera included.
        foamTilemap.tileAnim = [frame, 0];
      };
      // Guard: the app may have been destroyed while this async rebuild was
      // in flight (navigation), which nulls `app.ticker`.
      app.ticker?.add(tick);
      foamTickerRef.current = tick;
    }
  }

  // ── Decorations ────────────────────────────────────────────────────────────
  // Sort by manual z bias first, then y (lower rows render behind), then by
  // stack layer. z lets the user push a sprite in front of / behind overlaps.
  const decoEntries: Array<{
    x: number;
    y: number;
    inst: DecoInstance;
    layer: number;
  }> = [];
  for (const [key, stack] of Object.entries(decorations)) {
    const [xs, ys] = key.split(",");
    const x = Number(xs);
    const y = Number(ys);
    for (let i = 0; i < stack.length; i++) {
      decoEntries.push({ x, y, inst: stack[i]!, layer: i });
    }
  }
  decoEntries.sort((a, b) => (a.inst.z ?? 0) - (b.inst.z ?? 0) || a.y - b.y || a.layer - b.layer);

  // Path neighbour helper used inside the decoration loop below.
  const hasPath = (cx: number, cy: number): boolean => {
    const stack = decorations[`${cx},${cy}`];
    return !!stack && stack.some((e) => DECORATIONS[e.kind].family === "path");
  };

  for (const { x, y, inst, layer } of decoEntries) {
    const kind = inst.kind;
    // ── Path: procedurally generated tile texture (see pixi/path/*) ─────
    if (DECORATIONS[kind].family === "path") {
      const tex = getPathTexture(
        DECORATIONS[kind].pathMaterial ?? DEFAULT_PATH_MATERIAL,
        {
          n: hasPath(x, y - 1), e: hasPath(x + 1, y), s: hasPath(x, y + 1), w: hasPath(x - 1, y),
          ne: hasPath(x + 1, y - 1), nw: hasPath(x - 1, y - 1),
          se: hasPath(x + 1, y + 1), sw: hasPath(x - 1, y + 1),
        },
        x,
        y,
      );
      const sprite = new Sprite(tex);
      sprite.x = x * TILE;
      sprite.y = y * TILE;
      pathLayer.addChild(sprite);
      continue;
    }
    // Raised-floor marker: terrain-only, rendered above as highland grass.
    if (DECORATIONS[kind].family === "floor") continue;

    const def = DECORATIONS[kind];
    const srcForRot = decoSrc(def, inst);
    const baseTex = textureMap.get(srcForRot);
    if (!baseTex) continue;

    // Per-instance pixel offset from the free-hand tool. footprintCenterShift
    // re-centres even-width buildings over their whole footprint.
    const left = x * TILE + (TILE - def.frameW) / 2 + footprintCenterShift(kind) * TILE + (inst.dx ?? 0);
    const top =
      (def.anchor === "center"
        ? y * TILE + (TILE - def.frameH) / 2
        : (y + 1) * TILE - def.frameH) + (inst.dy ?? 0);
    // Horizontal mirror: flip around the sprite's own centre.
    const applyFlip = (s: Sprite | AnimatedSprite) => {
      if (inst.flip) {
        s.scale.x = -1;
        s.x = left + def.frameW;
      } else {
        s.x = left;
      }
      s.y = top;
    };

    // Each decoration is a container: a hidden amber glow silhouette (frame 0,
    // recoloured + blurred) behind the real sprite, toggled by the hover ticker
    // — the same sprite-shaped hover glow agents get, not a square outline.
    const container = new Container();
    container.label = `${x},${y}:${layer}`;
    const glowTex = cropTexture(baseTex, 0, 0, def.frameW, def.frameH);
    const glow = new Sprite(glowTex);
    applyFlip(glow);
    const glowFx = makeGlow();
    glow.filters = glowFx.filters;
    glow.visible = false;
    container.addChild(glow);

    if (def.frames > 1 && def.animClass) {
      const frames: Texture[] = Array.from(
        { length: def.frames },
        (_, i) => cropTexture(baseTex, i * def.frameW, 0, def.frameW, def.frameH),
      );
      const anim = new AnimatedSprite(frames);
      applyFlip(anim);
      anim.animationSpeed = decoAnimSpeed(kind);
      anim.play();
      container.addChild(anim);
    } else {
      const tex = cropTexture(baseTex, 0, 0, def.frameW, def.frameH);
      const sprite = new Sprite(tex);
      applyFlip(sprite);
      container.addChild(sprite);
    }
    const ex = container as Container & AgentContainerExtras;
    ex.__glow = glow;
    ex.__cm = glowFx.cm;
    decoLayer.addChild(container);
  }

  // ── Bridge caps ────────────────────────────────────────────────────────────
  if (hasBridges) {
    // A cap sits on a solid endpoint: land that ISN'T another bridge plank.
    // Excluding bridge cells matters for gap bridges (their planks sit on land,
    // unlike water bridges) so caps only land on the platform/ground ends.
    const isBridgeCell = (cx: number, cy: number): boolean => {
      const s = decorations[`${cx},${cy}`];
      return !!s && s.some((e) => e.kind === "bridge_h" || e.kind === "bridge_v");
    };
    const isEnd = (cx: number, cy: number): boolean =>
      grid[cy]?.[cx] === true && !isBridgeCell(cx, cy);
    for (const [key, stack] of Object.entries(decorations)) {
      const hasH = stack.some((e) => e.kind === "bridge_h");
      const hasV = stack.some((e) => e.kind === "bridge_v");
      if (!hasH && !hasV) continue;
      const [xs, ys] = key.split(",");
      const bx = Number(xs);
      const by = Number(ys);
      const capPairs: Array<{ x: number; y: number; src: string }> = [];
      if (hasH) {
        if (isEnd(bx - 1, by))
          capPairs.push({ x: bx - 1, y: by, src: BRIDGE_CAP_SRCS.h_l });
        if (isEnd(bx + 1, by))
          capPairs.push({ x: bx + 1, y: by, src: BRIDGE_CAP_SRCS.h_r });
      }
      if (hasV) {
        if (isEnd(bx, by - 1))
          capPairs.push({ x: bx, y: by - 1, src: BRIDGE_CAP_SRCS.v_t });
        if (isEnd(bx, by + 1))
          capPairs.push({ x: bx, y: by + 1, src: BRIDGE_CAP_SRCS.v_b });
      }
      for (const { x, y, src } of capPairs) {
        const capTex = textureMap.get(src);
        if (!capTex) continue;
        const sprite = new Sprite(capTex);
        sprite.x = x * TILE;
        sprite.y = y * TILE;
        capLayer.addChild(sprite);
      }
    }
  }
}
