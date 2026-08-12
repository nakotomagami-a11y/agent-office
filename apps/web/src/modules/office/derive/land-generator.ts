// Procedural land generator for the office map. Produces a boolean[][] grid
// (true = land/grass) from a shape + a few sliders, deterministic per seed.
// No decorations/buildings — terrain only. Always leaves a 2-tile water border
// so the landmass never touches the edge (room to expand, Civ-style).

export type LandShape =
  | "island"
  | "continent"
  | "archipelago"
  | "rooms"
  | "circle"
  | "rectangle";

export interface LandShapeDef {
  id: LandShape;
  label: string;
  /** Whether the "rooms" slider applies to this shape. */
  rooms: boolean;
}

export const LAND_SHAPES: LandShapeDef[] = [
  { id: "island", label: "Island", rooms: false },
  { id: "continent", label: "Continent", rooms: false },
  { id: "archipelago", label: "Archipelago", rooms: true },
  { id: "rooms", label: "Rooms", rooms: true },
  { id: "circle", label: "Circle", rooms: false },
  { id: "rectangle", label: "Rectangle", rooms: false },
];

export interface LandGenOptions {
  shape: LandShape;
  seed: number;
  /** 0..1 — how much of the usable area the land fills. */
  coverage: number;
  /** 0..1 — coastline irregularity. */
  roughness: number;
  /** 2..8 — island / room count (archipelago & rooms only). */
  rooms: number;
  cols: number;
  rows: number;
}

// Deterministic RNG (mulberry32) — same family used elsewhere for generation.
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

// Smoothed value noise sampled in normalized [0,1] space at a coarse frequency.
function makeNoise(rng: () => number, freq: number): (nx: number, ny: number) => number {
  const size = freq + 2;
  const vals = new Float32Array(size * size);
  for (let i = 0; i < vals.length; i++) vals[i] = rng();
  return (nx, ny) => {
    const fx = nx * freq;
    const fy = ny * freq;
    const x0 = Math.min(size - 2, Math.floor(fx));
    const y0 = Math.min(size - 2, Math.floor(fy));
    const tx = fx - x0;
    const ty = fy - y0;
    const sx = tx * tx * (3 - 2 * tx);
    const sy = ty * ty * (3 - 2 * ty);
    const v00 = vals[y0 * size + x0]!;
    const v10 = vals[y0 * size + x0 + 1]!;
    const v01 = vals[(y0 + 1) * size + x0]!;
    const v11 = vals[(y0 + 1) * size + x0 + 1]!;
    const a = lerp(v00, v10, sx);
    const b = lerp(v01, v11, sx);
    return lerp(a, b, sy); // 0..1
  };
}

function blank(cols: number, rows: number): boolean[][] {
  return Array.from({ length: rows }, () => Array.from({ length: cols }, () => false));
}

// Elliptical distance from centre in [-1,1] normalized units (1 = edge mid-side).
function ellipseDist(x: number, y: number, cols: number, rows: number): number {
  const dx = ((x + 0.5) / cols - 0.5) * 2;
  const dy = ((y + 0.5) / rows - 0.5) * 2;
  return Math.hypot(dx, dy);
}

export function generateLand(o: LandGenOptions): boolean[][] {
  const { shape, seed, coverage, roughness, rooms, cols, rows } = o;
  const rng = mulberry32(seed || 1);
  const grid = blank(cols, rows);

  const set = (x: number, y: number) => {
    if (x >= 0 && x < cols && y >= 0 && y < rows) grid[y]![x] = true;
  };

  if (shape === "island" || shape === "continent" || shape === "circle") {
    const noise = makeNoise(rng, shape === "continent" ? 5 : 4);
    // Radius in the [-1,1] ellipse space. Capped below the corners so a margin
    // of water always remains.
    const R = lerp(0.55, 1.02, coverage);
    const amp = shape === "circle" ? 0 : roughness * (shape === "continent" ? 0.32 : 0.22);
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const d = ellipseDist(x, y, cols, rows);
        const n = shape === "circle" ? 0 : (noise((x + 0.5) / cols, (y + 0.5) / rows) - 0.5) * 2 * amp;
        if (d < R + n) set(x, y);
      }
    }
  } else if (shape === "rectangle") {
    const noise = makeNoise(rng, 6);
    const halfW = lerp(0.45, 0.92, coverage);
    const halfH = lerp(0.45, 0.92, coverage);
    const amp = roughness * 0.18;
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const dx = Math.abs(((x + 0.5) / cols - 0.5) * 2);
        const dy = Math.abs(((y + 0.5) / rows - 0.5) * 2);
        const n = amp === 0 ? 0 : (noise((x + 0.5) / cols, (y + 0.5) / rows) - 0.5) * 2 * amp;
        if (dx < halfW + n && dy < halfH + n) set(x, y);
      }
    }
  } else if (shape === "archipelago") {
    const n = Math.max(2, Math.min(8, Math.round(rooms)));
    const noise = makeNoise(rng, 5);
    // Each island: a centre within the central 60% + a radius that shrinks with
    // island count so coverage stays roughly constant.
    const islands = Array.from({ length: n }, () => ({
      cx: lerp(0.22, 0.78, rng()),
      cy: lerp(0.22, 0.78, rng()),
      r: lerp(0.1, 0.24, coverage) / Math.sqrt(n) + 0.06,
    }));
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const nx = (x + 0.5) / cols;
        const ny = (y + 0.5) / rows;
        const wob = (noise(nx, ny) - 0.5) * 2 * roughness * 0.06;
        for (const is of islands) {
          const dx = nx - is.cx;
          const dy = ny - is.cy;
          if (Math.hypot(dx, dy) < is.r + wob) { set(x, y); break; }
        }
      }
    }
  } else {
    // "rooms" — rectangular rooms joined by L-corridors (dungeon-like landmass).
    const n = Math.max(2, Math.min(8, Math.round(rooms)));
    const pad = 3;
    const roomScale = lerp(0.12, 0.26, coverage);
    const centres: Array<{ cx: number; cy: number; w: number; h: number }> = [];
    for (let i = 0; i < n; i++) {
      const w = Math.round(lerp(4, cols * roomScale, rng()));
      const h = Math.round(lerp(4, rows * roomScale, rng()));
      const cx = Math.round(lerp(pad + w / 2, cols - pad - w / 2, rng()));
      const cy = Math.round(lerp(pad + h / 2, rows - pad - h / 2, rng()));
      centres.push({ cx, cy, w, h });
      for (let yy = cy - (h >> 1); yy <= cy + (h >> 1); yy++)
        for (let xx = cx - (w >> 1); xx <= cx + (w >> 1); xx++) set(xx, yy);
    }
    // Connect consecutive rooms with an L-shaped corridor (width from roughness).
    const cw = 1 + Math.round(roughness * 2);
    for (let i = 1; i < centres.length; i++) {
      const a = centres[i - 1]!;
      const b = centres[i]!;
      for (let x = Math.min(a.cx, b.cx); x <= Math.max(a.cx, b.cx); x++)
        for (let t = -cw; t <= cw; t++) set(x, a.cy + t);
      for (let y = Math.min(a.cy, b.cy); y <= Math.max(a.cy, b.cy); y++)
        for (let t = -cw; t <= cw; t++) set(b.cx + t, y);
    }
  }

  // Guarantee a water border (2 tiles) so land never touches the edge.
  for (let y = 0; y < rows; y++)
    for (let x = 0; x < cols; x++)
      if (x < 2 || y < 2 || x >= cols - 2 || y >= rows - 2) grid[y]![x] = false;

  return grid;
}
