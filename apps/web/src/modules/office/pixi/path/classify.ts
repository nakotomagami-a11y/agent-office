// Per-pixel classifier for a procedural path tile. Pure + pixi-free so it can
// be unit-tested and previewed headless. `renderPathTileRGBA` fills a raw RGBA
// buffer; the pixi layer (`path-texture.ts`) wraps that into a GPU texture.
//
// Model: a path is a boolean cell mask. For each pixel we take the (noise-
// warped) distance to the nearest NON-path cell in the 3×3 neighbourhood and
// band it: transparent (real grass shows through) → outline → soil-rim →
// surface fill. The tile draws ONLY the dirt/stone surface; everything beyond
// the edge is transparent so it blends into the existing grass ground tiles.
// Distance + noise are evaluated in world space, so adjacent tiles agree on the
// shared edge → seamless. Colours/thresholds live in `materials.ts`.

import type { PathMaterialConfig, RGB } from "./materials";
import { fbm2, hash2 } from "./noise";

// Mirrors office-map TILE. Kept local so this module stays pixi-free.
export const TILE = 64;

/** The 3×3 minus centre. `true` = that neighbour is also a path cell. */
export interface Neighborhood {
  n: boolean; e: boolean; s: boolean; w: boolean;
  ne: boolean; nw: boolean; se: boolean; sw: boolean;
}

/** Compact 8-bit signature of a neighbourhood — used for cache keys. */
export function neighborhoodMask(h: Neighborhood): number {
  return (
    (h.n ? 1 : 0) | (h.e ? 2 : 0) | (h.s ? 4 : 0) | (h.w ? 8 : 0) |
    (h.ne ? 16 : 0) | (h.nw ? 32 : 0) | (h.se ? 64 : 0) | (h.sw ? 128 : 0)
  );
}

// Offsets of the 8 neighbours in cell space, paired with their flag.
const OFFSETS: Array<[dx: number, dy: number, key: keyof Neighborhood]> = [
  [0, -1, "n"], [1, 0, "e"], [0, 1, "s"], [-1, 0, "w"],
  [1, -1, "ne"], [-1, -1, "nw"], [1, 1, "se"], [-1, 1, "sw"],
];

/** Clamped distance from world point (wx,wy) to the square of cell (cx,cy). */
function distToCell(wx: number, wy: number, cx: number, cy: number): number {
  const minX = cx * TILE, minY = cy * TILE;
  const dx = Math.max(minX - wx, 0, wx - (minX + TILE));
  const dy = Math.max(minY - wy, 0, wy - (minY + TILE));
  return Math.hypot(dx, dy);
}

const lerpRGB = (a: RGB, b: RGB, t: number): RGB => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];
const scaleRGB = (c: RGB, k: number): RGB => [c[0] * k, c[1] * k, c[2] * k];
const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);

/**
 * Cobblestone surface via a Worley (cellular) field: jittered stone centres on
 * a grid, mortar where two cells meet, per-stone tone + a rounded top-left
 * highlight so each cobble reads as a rounded stone. World-space → seamless.
 */
function cobbleFill(cfg: PathMaterialConfig, wx: number, wy: number): RGB {
  const CS = cfg.stoneSize ?? 12;
  const mortar = cfg.mortarWidth ?? 1.2;
  const gx = Math.floor(wx / CS);
  const gy = Math.floor(wy / CS);
  let f1 = Infinity, f2 = Infinity, tone = 0, bcx = 0, bcy = 0;
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const cx = gx + dx, cy = gy + dy;
      const jx = (cx + 0.25 + 0.5 * hash2(cx, cy, cfg.seed + 21)) * CS;
      const jy = (cy + 0.25 + 0.5 * hash2(cx, cy, cfg.seed + 22)) * CS;
      const d = Math.hypot(wx - jx, wy - jy);
      if (d < f1) { f2 = f1; f1 = d; tone = hash2(cx, cy, cfg.seed + 23); bcx = jx; bcy = jy; }
      else if (d < f2) { f2 = d; }
    }
  }
  const pal = cfg.palette;
  if (f2 - f1 < mortar) return pal.rim; // gap between stones = mortar
  // Per-stone tone, darkened toward the stone rim (rounded), with a top-left lit face.
  let shade = 0.55 + (tone - 0.5) * 0.5 - (f1 / CS) * 0.6;
  shade += (-((wx - bcx) + (wy - bcy)) / CS) * 0.14;
  return lerpRGB(pal.fillDark, pal.fillLight, clamp01(shade));
}

/**
 * Classify one pixel of the path tile at cell (cellX, cellY).
 * `lx,ly` are local pixel coords 0..TILE. Returns straight-alpha RGBA 0..255.
 */
export function classifyPathPixel(
  cfg: PathMaterialConfig,
  hood: Neighborhood,
  cellX: number,
  cellY: number,
  lx: number,
  ly: number,
): [number, number, number, number] {
  const wx = cellX * TILE + lx + 0.5;
  const wy = cellY * TILE + ly + 0.5;

  // Distance to the nearest grass (non-path) neighbour cell.
  let dGrass = Infinity;
  for (const [dx, dy, key] of OFFSETS) {
    if (hood[key]) continue; // that neighbour is path → not grass
    const d = distToCell(wx, wy, cellX + dx, cellY + dy);
    if (d < dGrass) dGrass = d;
  }

  // Warp the boundary so it wanders/clumps instead of being a clean arc.
  if (dGrass !== Infinity) {
    dGrass += (fbm2(wx * cfg.edgeNoiseFreq, wy * cfg.edgeNoiseFreq, cfg.seed) - 0.5) * 2 * cfg.edgeNoiseAmp;
  }

  const B = cfg.edgeInset;
  const { palette: pal } = cfg;

  // Beyond the surface edge: transparent → the real grass ground tile shows
  // through, so the path blends into the existing terrain with no fake grass.
  if (dGrass < B) return [0, 0, 0, 0];

  // --- Surface bands: crisp outline, then a dark soil/mortar rim, then fill ---
  if (dGrass < B + cfg.outlineWidth) {
    return [pal.outline[0], pal.outline[1], pal.outline[2], 255];
  }
  if (dGrass < B + cfg.outlineWidth + cfg.rimWidth) {
    return [pal.rim[0], pal.rim[1], pal.rim[2], 255];
  }

  // Interior fill: cobble stones or mottled surface with occasional specks.
  let col: RGB;
  if (cfg.surface === "cobble") {
    col = cobbleFill(cfg, wx, wy);
  } else {
    const m = fbm2(wx * cfg.fillNoiseFreq, wy * cfg.fillNoiseFreq, cfg.seed + 3);
    col = lerpRGB(pal.fillDark, pal.fillLight, m);
    const s = hash2(Math.round(wx * 0.6), Math.round(wy * 0.6), cfg.seed + 5);
    if (s > 1 - cfg.speckDensity) col = scaleRGB(col, 0.72);        // dark speck
    else if (s < cfg.speckDensity * 0.7) col = scaleRGB(col, 1.14); // light fleck
  }
  return [
    Math.min(255, col[0]),
    Math.min(255, col[1]),
    Math.min(255, col[2]),
    255,
  ];
}

/** Fill a TILE×TILE straight-alpha RGBA buffer for one path cell. */
export function renderPathTileRGBA(
  cfg: PathMaterialConfig,
  hood: Neighborhood,
  cellX: number,
  cellY: number,
  out: Uint8ClampedArray = new Uint8ClampedArray(TILE * TILE * 4),
): Uint8ClampedArray {
  for (let ly = 0; ly < TILE; ly++) {
    for (let lx = 0; lx < TILE; lx++) {
      const [r, g, b, a] = classifyPathPixel(cfg, hood, cellX, cellY, lx, ly);
      const i = (ly * TILE + lx) * 4;
      out[i] = r; out[i + 1] = g; out[i + 2] = b; out[i + 3] = a;
    }
  }
  return out;
}
