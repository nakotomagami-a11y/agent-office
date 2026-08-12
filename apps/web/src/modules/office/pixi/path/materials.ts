// Procedural path materials.
//
// A "material" is pure data: a palette + a handful of noise/geometry knobs the
// generator reads. Adding a new surface (sand, brick, cobble…) is a new entry
// here — no generator changes. This is the main tuning surface; everything in
// `classify.ts` is driven by these numbers so the look can be iterated fast.

export type RGB = [number, number, number];

export type PathMaterialId = "dirt" | "stone" | "sand" | "gravel";

/** How the interior surface is drawn. `mottled` = noisy fill (dirt/sand);
 *  `cobble` = discrete Worley stones with mortar gaps (stone/gravel). */
export type PathSurface = "mottled" | "cobble";

export interface PathPalette {
  /** Main surface colour. */
  fill: RGB;
  /** Surface mottle — low/high ends the fill noise lerps between. */
  fillDark: RGB;
  fillLight: RGB;
  /** Dark soil/mortar ring hugging the transparent edge. */
  rim: RGB;
  /** Crisp 1px edge where the surface meets the transparent (grass) area. */
  outline: RGB;
}

export interface PathMaterialConfig {
  id: PathMaterialId;
  label: string;
  /** px the surface edge is inset from the cell boundary toward the centre
   *  (beyond it is transparent, so the ground grass shows through). */
  edgeInset: number;
  /** px width of the dark rim just inside the edge. */
  rimWidth: number;
  /** px of the crisp outline at the transparent edge. */
  outlineWidth: number;
  /** boundary waviness — amplitude (px) and spatial frequency (cycles/px). */
  edgeNoiseAmp: number;
  edgeNoiseFreq: number;
  /** interior surface style. */
  surface: PathSurface;
  /** mottled only: mottle frequency (cycles/px) + speck density 0..1. */
  fillNoiseFreq: number;
  speckDensity: number;
  /** cobble only: stone cell size (px) and mortar gap width (px). */
  stoneSize?: number;
  mortarWidth?: number;
  palette: PathPalette;
  /** deterministic seed so materials differ and are stable across devices. */
  seed: number;
}

export const PATH_MATERIALS: Record<PathMaterialId, PathMaterialConfig> = {
  dirt: {
    id: "dirt",
    label: "Dirt trail",
    edgeInset: 7,
    rimWidth: 3,
    outlineWidth: 1.3,
    edgeNoiseAmp: 5,
    edgeNoiseFreq: 0.09,
    surface: "mottled",
    fillNoiseFreq: 0.05,
    speckDensity: 0.06,
    seed: 1000,
    palette: {
      fill:      [200, 150, 86],
      fillDark:  [168, 120, 66],
      fillLight: [214, 176, 110],
      rim:       [110, 74, 42],
      outline:   [60, 40, 24],
    },
  },
  // Cobblestone in the game's teal blue-grey (matches rock.png/rock*.png).
  stone: {
    id: "stone",
    label: "Cobblestone",
    edgeInset: 5,
    rimWidth: 2,
    outlineWidth: 1.3,
    edgeNoiseAmp: 3,
    edgeNoiseFreq: 0.1,
    surface: "cobble",
    fillNoiseFreq: 0,
    speckDensity: 0,
    stoneSize: 12,
    mortarWidth: 1.4,
    seed: 2000,
    palette: {
      fill:      [91, 138, 143],
      fillDark:  [55, 88, 95],
      fillLight: [150, 196, 194],
      rim:       [30, 50, 56],  // mortar
      outline:   [20, 32, 40],
    },
  },
  sand: {
    id: "sand",
    label: "Sand path",
    edgeInset: 8,
    rimWidth: 2,
    outlineWidth: 1,
    edgeNoiseAmp: 6,
    edgeNoiseFreq: 0.08,
    surface: "mottled",
    fillNoiseFreq: 0.06,
    speckDensity: 0.04,
    seed: 3000,
    palette: {
      fill:      [222, 202, 152],
      fillDark:  [198, 176, 126],
      fillLight: [238, 224, 186],
      rim:       [176, 150, 104],
      outline:   [120, 96, 62],
    },
  },
  // Small cool-grey pebbles — tighter cobble with more mortar.
  gravel: {
    id: "gravel",
    label: "Gravel",
    edgeInset: 6,
    rimWidth: 2,
    outlineWidth: 1.1,
    edgeNoiseAmp: 4,
    edgeNoiseFreq: 0.12,
    surface: "cobble",
    fillNoiseFreq: 0,
    speckDensity: 0,
    stoneSize: 6,
    mortarWidth: 0.9,
    seed: 4000,
    palette: {
      fill:      [126, 134, 136],
      fillDark:  [92, 100, 104],
      fillLight: [172, 180, 180],
      rim:       [56, 62, 68],
      outline:   [34, 40, 46],
    },
  },
};

export const DEFAULT_PATH_MATERIAL: PathMaterialId = "dirt";

export function isPathMaterial(v: unknown): v is PathMaterialId {
  return v === "dirt" || v === "stone" || v === "sand" || v === "gravel";
}

/** Ordered list for pickers/toolbars. */
export const PATH_MATERIAL_IDS: PathMaterialId[] = ["dirt", "stone", "sand", "gravel"];
