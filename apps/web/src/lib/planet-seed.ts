/**
 * Re-exports from @agent-office/pixel-planets.
 * Kept as a thin wrapper so existing imports from "@/lib/planet-seed" continue to work.
 */
import type { PlanetConfig } from "@agent-office/pixel-planets";
import { PLANET_TYPE_DEFS } from "@agent-office/pixel-planets";

export type { PlanetType, PlanetConfig, PlanetParams, PlanetLayer, PlanetParamDef } from "@agent-office/pixel-planets";
export { getPlanetParams, PLANET_TYPE_DEFS, PLANET_PARAM_DEFS, FREEFORM_TYPES, CANVAS_SCALE, randomPlanet, randomPlanetOfType } from "@agent-office/pixel-planets";

/**
 * Human-readable "type · palette" label for a project's planet (e.g. "Terran ·
 * Savanna") — real metadata pulled from `PLANET_TYPE_DEFS`, not fabricated
 * flavor text. Returns `null` when the project hasn't picked a planet yet.
 */
export function planetTag(config: PlanetConfig | undefined): string | null {
  if (!config) return null;
  const typeDef = PLANET_TYPE_DEFS[config.type];
  const paletteName = typeDef.palettes[config.paletteIdx]?.name;
  return paletteName ? `${typeDef.label} · ${paletteName}` : typeDef.label;
}
