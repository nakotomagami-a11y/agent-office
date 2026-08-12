/**
 * Helpers for generating random planet configs.
 * These are thin wrappers around Math.random — not seeded, use for UI "randomize" actions.
 */
import type { PlanetType, PlanetConfig } from "./types";
import { PLANET_TYPE_DEFS } from "./palettes/index";

/** All registered planet types in declaration order. */
const ALL_TYPES = Object.keys(PLANET_TYPE_DEFS) as PlanetType[];

/**
 * Generate a fully random planet config (random type, seed, and palette).
 * Suitable for seeding a new project's planet icon.
 */
export function randomPlanet(): PlanetConfig {
  const type = ALL_TYPES[Math.floor(Math.random() * ALL_TYPES.length)]!;
  return randomPlanetOfType(type);
}

/**
 * Generate a random seed and palette for a given planet type.
 * Use this when the user clicks "randomize" in the editor — keeps the type
 * fixed while varying the appearance.
 */
export function randomPlanetOfType(type: PlanetType): PlanetConfig {
  const palettes = PLANET_TYPE_DEFS[type].palettes;
  return {
    type,
    seed: Math.floor(Math.random() * 999_999_999) + 1,
    paletteIdx: Math.floor(Math.random() * palettes.length),
    pixels: 1000,
    dither: true,
  };
}
