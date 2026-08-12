/**
 * Catalog of grass-tile color variants. Each entry is a 9×6 tileset PNG
 * that follows the *exact* same layout as the default - only the hue
 * differs (taken from the Tiny Swords Free Pack's Tilemap_color1..5).
 *
 * The grass color is an **island-level** choice (one per scene, not per
 * cell). That keeps the auto-tile picker dead simple - it never has to
 * blend two colors at a transition - and matches what users expect:
 * pick the vibe of your island once.
 *
 * Adding a new color: drop the 9×6 PNG in /apps/web/public/tiles/ and
 * append an entry below. The build toolbar swatch row pulls from this
 * registry automatically.
 *
 * Side transitions (a color shifting into a different color or another
 * terrain mid-island) aren't supported yet - corners/edges only auto-
 * tile within a single color. That's intentional for now.
 */

export type GrassColor =
  | "yellow"
  | "green"
  | "light"
  | "olive"
  | "teal";

export interface GrassColorDef {
  id: GrassColor;
  label: string;
  /** Tileset URL - same 9×6 layout as the default grass.png. */
  src: string;
}

export const GRASS_COLORS: Record<GrassColor, GrassColorDef> = {
  yellow: {
    id: "yellow",
    label: "Meadow",
    src: "/tiles/grass.png",
  },
  green: {
    id: "green",
    label: "Forest",
    src: "/tiles/grass-green.png",
  },
  light: {
    id: "light",
    label: "Spring",
    src: "/tiles/grass-light.png",
  },
  olive: {
    id: "olive",
    label: "Marsh",
    src: "/tiles/grass-olive.png",
  },
  teal: {
    id: "teal",
    label: "Frost",
    src: "/tiles/grass-teal.png",
  },
};

export const GRASS_COLOR_LIST: GrassColorDef[] = Object.values(GRASS_COLORS);

export const DEFAULT_GRASS_COLOR: GrassColor = "yellow";

export function isGrassColor(v: unknown): v is GrassColor {
  return typeof v === "string" && Object.prototype.hasOwnProperty.call(GRASS_COLORS, v);
}

export function grassTilesetSrc(color: GrassColor): string {
  return GRASS_COLORS[color].src;
}
