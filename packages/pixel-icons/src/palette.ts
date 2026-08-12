/**
 * Tiny-Swords material palette. Sampled from apps/web/public/units/*.png — the
 * pack uses a tight set of 3–4-tone ramps per material (cool grey-blue steel,
 * warm gold, wood, dark leather) over a shared near-black outline, instead of
 * the free-hue HSV the generator used. Picking material colours from these
 * ramps is what collapses our ~30–45-colour icons down to the pack's ~12.
 */
import type { Color } from "./types";
import type { Rng } from "./rng";

export interface Ramp {
  shadow: Color;
  mid: Color;
  light: Color;
  spec: Color;
}

function hx(h: string): Color {
  return { r: parseInt(h.slice(1, 3), 16), g: parseInt(h.slice(3, 5), 16), b: parseInt(h.slice(5, 7), 16) };
}
function ramp(shadow: string, mid: string, light: string, spec: string): Ramp {
  return { shadow: hx(shadow), mid: hx(mid), light: hx(light), spec: hx(spec) };
}

/** Warm near-black outline used across the whole pack. */
export const OUTLINE: [number, number, number] = [0x16, 0x1c, 0x2e];

export const STEEL = ramp("#4a5560", "#8c9695", "#b8c1c3", "#eef2f4");
export const BLUED = ramp("#3b3f52", "#5e6f86", "#8c9695", "#c2ccce");
export const GOLD = ramp("#7a5a30", "#c8a876", "#efe1ab", "#fff4cf");
export const WOOD = ramp("#443528", "#7a5f48", "#a1856a", "#c0a586");
export const DARK = ramp("#20202e", "#3a384a", "#5a5560", "#736e7a"); // leather / dark metal
export const BONE = ramp("#8a8168", "#c9c0a0", "#e6ddbf", "#f5eed6");
export const BRONZE = ramp("#5e3f28", "#9a6a3e", "#c89058", "#e8c088"); // warm copper blade
export const DARKIRON = ramp("#242833", "#414756", "#6a7080", "#9aa4b4"); // near-black steel
export const RUST = ramp("#38200f", "#6e3c1e", "#94592c", "#b87a40"); // corrosion / patina spots

/** Cloth banners / ribbon streamers hung on polearms. */
export const RIBBONS: Ramp[] = [
  ramp("#5a1620", "#a02434", "#d0404e", "#f07078"), // crimson
  ramp("#16305a", "#2a54a0", "#4a7ad0", "#7aa8f0"), // blue
  ramp("#2e2c3e", "#434055", "#5e5455", "#767080"), // dark leather
  ramp("#3a2c14", "#6e5024", "#9a7838", "#c0a050"), // tan
];

/** Saturated magic-crystal blade materials (occasional enchanted weapons). */
export const CRYSTALS: Ramp[] = [
  ramp("#1a4a38", "#2f9060", "#6fd0a0", "#d6ffe8"), // emerald
  ramp("#123258", "#2f6bb0", "#6fb0e8", "#d2e8ff"), // sapphire
  ramp("#5a1626", "#c0304a", "#f06a80", "#ffd4dc"), // ruby
  ramp("#33184f", "#7a3fb0", "#b880e8", "#ecd6ff"), // amethyst
];
export const pickCrystal = (r: Rng): Ramp => CRYSTALS[Math.floor(r.float() * CRYSTALS.length) % CRYSTALS.length]!;

const BLADE_METALS = [STEEL, BLUED, STEEL, BRONZE, DARKIRON]; // steel weighted, + bronze / dark iron
const GUARD_ACCENTS = [GOLD, STEEL, DARK, GOLD];
const HAFT_MATERIALS = [WOOD, DARK, WOOD, BLUED];
const POLE_HEADS = [STEEL, BLUED];

const pick = <T,>(r: Rng, arr: T[]): T => arr[Math.floor(r.float() * arr.length) % arr.length]!;

export const pickBladeMetal = (r: Rng): Ramp => pick(r, BLADE_METALS);
export const pickGuardAccent = (r: Rng): Ramp => pick(r, GUARD_ACCENTS);
export const pickHaft = (r: Rng): Ramp => pick(r, HAFT_MATERIALS);
export const pickPoleHead = (r: Rng): Ramp => pick(r, POLE_HEADS);

/** Saturated gem ramps — the pack has no gem staffs, so keep a small controlled
 *  set rather than free hue, so staffs still read as part of the family. */
/** Every material tone flattened — the fixed set a finished icon is snapped to
 *  (Phase 4). Keeps the whole icon inside the pack's ~4-tones-per-material
 *  budget and turns continuous shader gradients into hard cel bands. */
export const GEMS: Ramp[] = [
  ramp("#5a1030", "#c02850", "#f06a86", "#ffd0d8"), // ruby
  ramp("#12325a", "#2f6bb0", "#5fa0e0", "#cfe6ff"), // sapphire
  ramp("#123a2a", "#2f9060", "#5fc890", "#d0ffe4"), // emerald
  ramp("#3a1a5a", "#7a3fb0", "#b07fe0", "#e8d0ff"), // amethyst
  ramp("#5a3a10", "#c88a20", "#f0c250", "#fff0c0"), // topaz
];
export const pickGem = (r: Rng): Ramp => pick(r, GEMS);

/** Every material tone flattened — the fixed set a finished icon is snapped to
 *  (Phase 4). Keeps the whole icon inside the pack's ~4-tones-per-material
 *  budget and turns continuous shader gradients into hard cel bands. */
export function allTones(): Color[] {
  const out: Color[] = [];
  for (const rp of [STEEL, BLUED, GOLD, WOOD, DARK, BONE, BRONZE, DARKIRON, RUST, ...RIBBONS, ...CRYSTALS, ...GEMS]) out.push(rp.shadow, rp.mid, rp.light, rp.spec);
  return out;
}
