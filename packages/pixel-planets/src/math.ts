/**
 * Low-level math utilities used by the palette and parameter systems.
 *
 * Kept separate from rendering so this module has zero browser dependencies
 * and can run in Node.js (e.g. server-side random planet generation).
 */

// Types

/** Normalised RGB triple — all components in [0, 1]. */
export type RGB = [number, number, number];

// Deterministic random number generation

/**
 * Mulberry32 — a fast, high-quality 32-bit PRNG seeded with a single integer.
 *
 * Why mulberry32: it passes PractRand statistical tests, produces visually
 * uncorrelated outputs for adjacent seeds, and is only a handful of
 * integer operations. Perfect for deterministic planet generation where
 * "same seed → same planet" must hold across devices and restarts.
 *
 * Returns a closure so multiple independent streams can coexist without
 * sharing state.
 */
export function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Derive a stable 32-bit integer from a project-id string.
 *
 * Project IDs are UUIDs or slug strings, not integers. We need an integer
 * seed for mulberry32. XOR-folding the hex bytes gives a cheap, collision-
 * resistant mapping without pulling in a hash library.
 */
export function hashProjectId(id: string): number {
  const hex = id.replace(/-/g, "");
  let h = 0;
  for (let i = 0; i < 32; i += 8) {
    h ^= parseInt(hex.slice(i, i + 8) || "0", 16);
  }
  return h >>> 0;
}

// Color utilities

/**
 * Expand an array of RGB triples into a flat RGBA array suitable for
 * uploading to a GLSL `vec4[]` uniform. Alpha is always 1.0.
 */
export function toRGBA(colors: RGB[]): number[] {
  return colors.flatMap(([r, g, b]) => [r, g, b, 1.0]);
}

/** Darken an RGB color by a linear `amount` (0 = no change, 1 = black). */
export function darkened(rgb: RGB, amount: number): RGB {
  const f = 1 - amount;
  return [rgb[0] * f, rgb[1] * f, rgb[2] * f];
}

/** Lighten an RGB color towards white by a linear `amount` (0 = no change, 1 = white). */
export function lightened(rgb: RGB, amount: number): RGB {
  return [
    rgb[0] + (1 - rgb[0]) * amount,
    rgb[1] + (1 - rgb[1]) * amount,
    rgb[2] + (1 - rgb[2]) * amount,
  ];
}

// HSV ↔ RGB conversion (used by shiftHue)

function rgbToHsv(r: number, g: number, b: number): [number, number, number] {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  const s = max === 0 ? 0 : d / max;
  let h = 0;
  if (d !== 0) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h /= 6;
    if (h < 0) h += 1;
  }
  return [h, s, max];
}

function hsvToRgb(h: number, s: number, v: number): RGB {
  const i = Math.floor(h * 6);
  const f = h * 6 - i;
  const p = v * (1 - s);
  const q = v * (1 - f * s);
  const t = v * (1 - (1 - f) * s);
  const mod = i % 6;
  if (mod === 0) return [v, t, p];
  if (mod === 1) return [q, v, p];
  if (mod === 2) return [p, v, t];
  if (mod === 3) return [p, q, v];
  if (mod === 4) return [t, p, v];
  return [v, p, q];
}

/** Rotate the hue of an RGB color by `delta` turns (0–1). */
export function shiftHue(rgb: RGB, delta: number): RGB {
  const [h, s, v] = rgbToHsv(rgb[0], rgb[1], rgb[2]);
  return hsvToRgb((h + delta + 1) % 1, s, v);
}

// Cosine colour palette (Inigo Quilez technique)

/**
 * Generate `n` perceptually-pleasing colors using the cosine palette method.
 *
 * The idea: a cosine function in RGB space traces a smooth arc through
 * color space. Sampling it at evenly-spaced `t` values gives a harmonious
 * sequence of colors that look good together regardless of the random
 * parameters.
 *
 * Reference: https://iquilezles.org/articles/palettes/
 *
 * @param n          Number of colors to generate.
 * @param hueDiff    How wide the arc sweeps across hue (0 = monochrome, 1 = full spectrum).
 * @param saturation Overall vibrancy of the colors.
 * @param rng        A seeded mulberry32 RNG closure.
 */
export function cosineScheme(
  n: number,
  hueDiff: number,
  saturation: number,
  rng: () => number,
): RGB[] {
  const b = 0.5 * saturation;
  const cx = (rng() + 0.5) * hueDiff;
  const cy = (rng() + 0.5) * hueDiff;
  const cz = (rng() + 0.5) * hueDiff;
  const scale = rng() * 2 + 1;
  const dx = rng() * scale;
  const dy = rng() * scale;
  const dz = rng() * scale;
  const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
  const nmax = Math.max(1, n - 1);
  return Array.from({ length: n }, (_, i) => {
    const t = i / nmax;
    return [
      clamp01(0.5 + b * Math.cos(2 * Math.PI * (cx * t + dx))),
      clamp01(0.5 + b * Math.cos(2 * Math.PI * (cy * t + dy))),
      clamp01(0.5 + b * Math.cos(2 * Math.PI * (cz * t + dz))),
    ];
  });
}
