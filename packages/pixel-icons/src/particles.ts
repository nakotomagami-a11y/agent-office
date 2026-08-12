/**
 * Procedural particle FX for weapon icons. Ten seeded types, each a scatter of
 * small glowing pixels that hug the weapon's silhouette (sampled from its opaque
 * pixels) so they read as belonging to it. Drawn AFTER the outline as a light
 * layer (semi-transparent), never snapped — the icon's magical/elemental aura.
 */
import type { Pen } from "./pen";
import type { Rng } from "./rng";

export type ParticleType =
  | "sparkle" | "ember" | "frost" | "spark" | "mote"
  | "leaf" | "bubble" | "blood" | "holy" | "ash";

export const PARTICLE_TYPES: ParticleType[] = [
  "sparkle", "ember", "frost", "spark", "mote", "leaf", "bubble", "blood", "holy", "ash",
];

export function pickParticleType(rng: Rng): ParticleType {
  return PARTICLE_TYPES[Math.floor(rng.float() * PARTICLE_TYPES.length) % PARTICLE_TYPES.length]!;
}

/**
 * Choose a particle type that MATCHES the drawn weapon: its most saturated /
 * brightest pixel picks the element — red→ember/blood, green→leaf, blue→frost/
 * bubble, gold→holy/ember, grey steel→spark/frost sheen, dark→ash, else sparkle.
 */
export function pickThemedParticle(pen: Pen, rng: Rng): ParticleType {
  const w = pen.dimension;
  const h = pen.dimension;
  const d = pen.ctx.getImageData(0, 0, w, h).data;
  let best = -1;
  let br = 200;
  let bg = 200;
  let bb = 200;
  let cnt = 0;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3]! < 250) continue;
    const r = d[i]!;
    const g = d[i + 1]!;
    const b = d[i + 2]!;
    const sat = Math.max(r, g, b) - Math.min(r, g, b);
    const score = sat * 1.6 + Math.max(r, g, b) * 0.3;
    if (score > best) { best = score; br = r; bg = g; bb = b; }
    cnt++;
  }
  if (!cnt) return "sparkle";
  const r = br;
  const g = bg;
  const b = bb;
  const mx = Math.max(r, g, b);
  const sat = mx - Math.min(r, g, b);
  if (sat < 42) return mx < 95 ? "ash" : rng.float() < 0.5 ? "spark" : "frost"; // steel / dark
  if (r > g + 20 && r > b + 20) return rng.float() < 0.5 ? "ember" : "blood"; // red
  if (g >= r && g > b + 15) return "leaf"; // green
  if (b >= r && b >= g) return rng.float() < 0.5 ? "frost" : "bubble"; // blue
  if (r > b + 20 && g > b) return rng.float() < 0.5 ? "holy" : "ember"; // gold / yellow
  return "sparkle"; // purple / other
}

type Plot = (x: number, y: number, r: number, g: number, b: number, a: number) => void;

export function drawParticles(pen: Pen, type: ParticleType, rng: Rng, count = 0): void {
  const w = pen.dimension;
  const h = pen.dimension;
  const data = pen.ctx.getImageData(0, 0, w, h).data;
  const pts: number[] = [];
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) {
      if (data[(x + y * w) * 4 + 3]! > 0) { pts.push(x, y); }
    }
  }
  if (!pts.length) return;

  const ctx = pen.ctx;
  const plot: Plot = (x, y, r, g, b, a) => {
    const xi = Math.round(x);
    const yi = Math.round(y);
    if (xi < 0 || yi < 0 || xi >= w || yi >= h) return;
    ctx.fillStyle = `rgba(${r | 0},${g | 0},${b | 0},${Math.max(0, Math.min(1, a)).toFixed(3)})`;
    ctx.fillRect(xi, yi, 1, 1);
  };

  const n = count || 12 + rng.range(0, 12);
  const spread = type === "ember" || type === "spark" || type === "holy" ? 8 : 6;
  for (let i = 0; i < n; i++) {
    const p = Math.floor(rng.float() * (pts.length / 2)) * 2;
    const ang = rng.rangeFloat(0, Math.PI * 2);
    const rad = rng.floatLow() * spread;
    let x = pts[p]! + Math.cos(ang) * rad;
    let y = pts[p + 1]! + Math.sin(ang) * rad;
    switch (type) {
      case "sparkle": sparkle(plot, x, y, 1 + rng.range(0, 2)); break;
      case "ember": {
        y -= rng.floatLow() * 4;
        const t = rng.float();
        plot(x, y, 255, 150 + t * 80, 40, 0.9);
        if (rng.float() < 0.5) plot(x, y - 1, 255, 90, 20, 0.5);
        break;
      }
      case "frost": plus(plot, x, y, 210, 240, 255, rng.float() < 0.5 ? 1 : 2, 0.85); break;
      case "spark": zig(plot, x, y); break;
      case "mote": plot(x, y, 225, 225, 235, 0.32 + rng.float() * 0.35); break;
      case "leaf": { plot(x, y, 96, 180, 72, 0.9); plot(x + 1, y, 60, 138, 50, 0.85); break; }
      case "bubble": ring(plot, x, y, 1 + rng.range(0, 1), 150, 220, 255, 0.7); break;
      case "blood": {
        y += rng.floatLow() * 5;
        plot(x, y, 184, 32, 42, 0.95);
        if (rng.float() < 0.5) plot(x, y + 1, 120, 18, 26, 0.8);
        break;
      }
      case "holy": star(plot, x, y, 255, 240, 180); break;
      case "ash": { y -= rng.floatLow() * 3; plot(x, y, 120, 120, 132, 0.28 + rng.float() * 0.32); break; }
    }
  }
}

function sparkle(plot: Plot, cx: number, cy: number, size: number): void {
  for (let k = 1; k <= size; k++) {
    const a = (1 - k / (size + 1)) * 0.9;
    plot(cx + k, cy, 255, 255, 255, a);
    plot(cx - k, cy, 255, 255, 255, a);
    plot(cx, cy + k, 255, 255, 255, a);
    plot(cx, cy - k, 255, 255, 255, a);
  }
  plot(cx, cy, 255, 255, 255, 1);
}

function plus(plot: Plot, cx: number, cy: number, r: number, g: number, b: number, size: number, a: number): void {
  plot(cx, cy, 255, 255, 255, a);
  plot(cx + size, cy, r, g, b, a * 0.7);
  plot(cx - size, cy, r, g, b, a * 0.7);
  plot(cx, cy + size, r, g, b, a * 0.7);
  plot(cx, cy - size, r, g, b, a * 0.7);
}

function zig(plot: Plot, cx: number, cy: number): void {
  plot(cx, cy, 255, 240, 90, 0.95);
  plot(cx + 1, cy - 1, 255, 232, 60, 0.9);
  plot(cx + 2, cy, 255, 244, 110, 0.9);
  plot(cx + 3, cy - 1, 255, 232, 60, 0.6);
}

function ring(plot: Plot, cx: number, cy: number, rad: number, r: number, g: number, b: number, a: number): void {
  for (let d = 0; d < Math.PI * 2; d += Math.PI / 3) {
    plot(cx + Math.cos(d) * rad, cy + Math.sin(d) * rad, r, g, b, a);
  }
}

function star(plot: Plot, cx: number, cy: number, r: number, g: number, b: number): void {
  plot(cx, cy, 255, 255, 255, 1);
  plot(cx + 1, cy, r, g, b, 0.9);
  plot(cx - 1, cy, r, g, b, 0.9);
  plot(cx, cy + 1, r, g, b, 0.9);
  plot(cx, cy - 1, r, g, b, 0.9);
  plot(cx + 2, cy, r, g, b, 0.4);
  plot(cx - 2, cy, r, g, b, 0.4);
}
