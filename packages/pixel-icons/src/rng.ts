/**
 * Seeded RNG. `xmur3` hashes the string seed into a 32-bit state generator;
 * `sfc32` is the actual PRNG stream. `checkpoint()` re-derives a fresh stream
 * from the seed generator so each drawing sub-step gets an independent stream —
 * this is what keeps output stable when one component's random-draw count
 * changes (faithful to the original Icon Machine behaviour).
 *
 * RNG algorithms from https://stackoverflow.com/a/47593316
 */
import type { Color } from "./types";

export function xmur3(str: string): () => number {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return function () {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return (h ^= h >>> 16) >>> 0;
  };
}

export function sfc32(a: number, b: number, c: number, d: number): () => number {
  return function () {
    a >>>= 0;
    b >>>= 0;
    c >>>= 0;
    d >>>= 0;
    let t = (a + b) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    d = (d + 1) | 0;
    t = (t + d) | 0;
    c = (c + t) | 0;
    return (t >>> 0) / 4294967296;
  };
}

/** Generate a random 16-char alphanumeric seed string. */
export function createRandomSeed(randomFunc: () => number = Math.random): string {
  let s = "";
  for (let i = 0; i < 16; i++) {
    let c = Math.floor(randomFunc() * 62);
    if (c < 10) c = 48 + c;
    else if (c < 36) c = 65 - 10 + c;
    else c = 97 - 36 + c;
    s += String.fromCharCode(c);
  }
  return s;
}

export class Rng {
  private seedGen: (() => number) | null = null;
  private rand: () => number = Math.random;

  seed(seed: string): void {
    this.seedGen = xmur3(seed);
    this.checkpoint();
  }

  /** Re-derive the stream from the seed generator. */
  checkpoint(): void {
    if (this.seedGen) {
      this.rand = sfc32(this.seedGen(), this.seedGen(), this.seedGen(), this.seedGen());
    }
  }

  float(): number {
    return this.rand();
  }

  /** Weighted down (square). */
  floatLow(): number {
    const v = this.rand();
    return v * v;
  }

  /** Weighted up. */
  floatHigh(): number {
    return 1 - this.floatLow();
  }

  /** Weighted to the extremes. */
  floatExtreme(): number {
    const r = this.rand() * 2 - 1;
    return r * r;
  }

  sign(): number {
    return this.rand() > 0.5 ? 1 : -1;
  }

  rangeFloat(min: number, max: number): number {
    return this.rand() * (max - min) + min;
  }

  rangeFloatLow(min: number, max: number): number {
    return this.floatLow() * (max - min) + min;
  }

  rangeFloatHigh(min: number, max: number): number {
    return this.floatHigh() * (max - min) + min;
  }

  // Faithful to the original: the (max-min)/2 magnitude was passed to
  // floatHigh() (which ignores its argument), so the deviation is an unscaled
  // [0,1) floatHigh regardless of min/max. Preserved for identical output.
  rangeFloatExtreme(min: number, max: number): number {
    return this.sign() * this.floatHigh() + (max + min) / 2;
  }

  range(min: number, max: number): number {
    return Math.floor(this.rangeFloat(min, max));
  }

  rangeLow(min: number, max: number): number {
    return Math.floor(this.rangeFloatLow(min, max));
  }

  rangeHigh(min: number, max: number): number {
    return Math.floor(this.rangeFloatHigh(min, max));
  }

  color(): Color {
    return { r: this.range(0, 256), g: this.range(0, 256), b: this.range(0, 256) };
  }

  /** Randomize each channel within maxamt/2 of the given color. */
  randomize(color: Color, maxamt: number): Color {
    const half = Math.floor(maxamt / 2);
    const c: Color = {
      r: Math.max(0, Math.min(255, color.r + this.range(-half, half))),
      g: Math.max(0, Math.min(255, color.g + this.range(-half, half))),
      b: Math.max(0, Math.min(255, color.b + this.range(-half, half))),
    };
    if (color.a !== undefined) c.a = color.a;
    return c;
  }

  /** Randomize each channel to at least range/2 away from the given color. */
  invertRandomize(color: Color, range: number): Color {
    const c: Color = {
      r: (color.r + Math.floor(range / 2) + this.range(0, 255 - range)) % 256,
      g: (color.g + Math.floor(range / 2) + this.range(0, 255 - range)) % 256,
      b: (color.b + Math.floor(range / 2) + this.range(0, 255 - range)) % 256,
    };
    if (color.a !== undefined) c.a = color.a;
    return c;
  }
}
