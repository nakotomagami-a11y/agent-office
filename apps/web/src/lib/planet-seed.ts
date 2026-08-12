/**
 * Re-exports from @agent-office/pixel-planets.
 * Kept as a thin wrapper so existing imports from "@/lib/planet-seed" continue to work.
 */
export type { PlanetType, PlanetConfig, PlanetParams, PlanetLayer } from "@agent-office/pixel-planets";
export { getPlanetParams, PLANET_TYPE_DEFS, FREEFORM_TYPES, CANVAS_SCALE, randomPlanet, randomPlanetOfType } from "@agent-office/pixel-planets";
