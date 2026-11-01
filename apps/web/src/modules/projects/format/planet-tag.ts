import { PLANET_TYPE_DEFS, type PlanetConfig } from "@agent-office/pixel-planets";

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
