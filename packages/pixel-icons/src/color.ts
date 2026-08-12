/**
 * Pure color helpers (no RNG). RNG-dependent color ops live on {@link Rng}.
 */
import type { Color } from "./types";

interface Hsv {
  h: number;
  s: number;
  v: number;
}

export function hsvToRgb(color: Hsv): Color {
  const c = color.v * color.s;
  const x = c * (1 - Math.abs(((color.h / 60) % 2) - 1));
  const m = color.v - c;
  let out: Color;
  if (color.h < 60) out = { r: c, g: x, b: 0 };
  else if (color.h < 120) out = { r: x, g: c, b: 0 };
  else if (color.h < 180) out = { r: 0, g: c, b: x };
  else if (color.h < 240) out = { r: 0, g: x, b: c };
  else if (color.h < 300) out = { r: x, g: 0, b: c };
  else out = { r: c, g: 0, b: x };
  out.r = Math.round((out.r + m) * 255);
  out.g = Math.round((out.g + m) * 255);
  out.b = Math.round((out.b + m) * 255);
  return out;
}

/**
 * Cel-shading: number of discrete value steps every {@link colorLerp} blend is
 * snapped to. This is what gives the tiny-swords look — hard shadow/highlight
 * bands instead of smooth airbrush gradients. 0 or 1 disables (continuous).
 * Set once per render from the generator; canvas drawing is synchronous so a
 * module-level knob is safe.
 */
let celSteps = 0;

/** Configure cel-shading step count for subsequent {@link colorLerp} calls. */
export function setCelSteps(n: number): void {
  celSteps = Number.isFinite(n) && n > 1 ? Math.floor(n) : 0;
}

/** Snap a 0..1 blend factor to the nearest cel band (no-op when disabled). */
export function quantize(t: number): number {
  if (celSteps <= 1) return t;
  return Math.round(t * (celSteps - 1)) / (celSteps - 1);
}

export function colorLerp(a: Color, b: Color, t: number): Color {
  t = quantize(Math.max(0, Math.min(1, t)));
  const aa = a.a ?? 1;
  const ba = b.a ?? 1;
  return {
    r: (b.r - a.r) * t + a.r,
    g: (b.g - a.g) * t + a.g,
    b: (b.b - a.b) * t + a.b,
    a: (ba - aa) * t + aa,
  };
}

export function colorDarken(color: Color, t: number): Color {
  const c: Color = {
    r: color.r * (1 - t),
    g: color.g * (1 - t),
    b: color.b * (1 - t),
  };
  if (color.a !== undefined) c.a = color.a;
  return c;
}

export function colorLighten(color: Color, t: number): Color {
  t = 1 - t;
  const c: Color = {
    r: (1 - (1 - color.r / 255) * t) * 255,
    g: (1 - (1 - color.g / 255) * t) * 255,
    b: (1 - (1 - color.b / 255) * t) * 255,
  };
  if (color.a !== undefined) c.a = color.a;
  return c;
}

export function colorStr(color: Color): string {
  if (color.a !== undefined) {
    return `rgba(${Math.floor(color.r)},${Math.floor(color.g)},${Math.floor(color.b)},${color.a})`;
  }
  return `rgb(${Math.floor(color.r)},${Math.floor(color.g)},${Math.floor(color.b)})`;
}
