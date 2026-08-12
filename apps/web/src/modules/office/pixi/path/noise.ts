// Deterministic world-space value noise for the path generator.
//
// Sampled in WORLD pixel coordinates so two adjacent path tiles compute an
// identical boundary along their shared edge — that's what makes the organic
// edge seamless without any hand-authored tile-alignment. No pixi, no deps.

/** Integer-lattice hash → [0,1). Stable for any (possibly negative) ints. */
export function hash2(ix: number, iy: number, seed: number): number {
  let h = (Math.imul(ix, 374761393) + Math.imul(iy, 668265263) + Math.imul(seed, 2246822519)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h = (h ^ (h >>> 16)) >>> 0;
  return h / 4294967296;
}

const smooth = (t: number): number => t * t * (3 - 2 * t);

/** Bilinear value noise at (x,y) in lattice units → [0,1). */
export function noise2(x: number, y: number, seed = 0): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = smooth(x - x0);
  const fy = smooth(y - y0);
  const v00 = hash2(x0, y0, seed);
  const v10 = hash2(x0 + 1, y0, seed);
  const v01 = hash2(x0, y0 + 1, seed);
  const v11 = hash2(x0 + 1, y0 + 1, seed);
  const top = v00 * (1 - fx) + v10 * fx;
  const bot = v01 * (1 - fx) + v11 * fx;
  return top * (1 - fy) + bot * fy;
}

/** 2-octave fractal noise → [0,1). Richer edges/mottle than a single octave. */
export function fbm2(x: number, y: number, seed = 0): number {
  return noise2(x, y, seed) * 0.65 + noise2(x * 2.03, y * 2.03, seed + 11) * 0.35;
}
