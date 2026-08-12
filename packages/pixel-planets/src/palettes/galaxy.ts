/**
 * Palettes for the Galaxy type.
 *
 * Single layer (galaxy shader, 7 colors). The shader uses 6 discrete color
 * "levels" (n_colors=6), but needs a 7-element array so the posterised fbm
 * value (0–6) can index `colors[int(f2)]` without an out-of-bounds access
 * at the maximum value. The 7th color is effectively the darkest background.
 *
 * The shader applies tilt (y-scale), swirl rotation, and zoom to produce a
 * spiral galaxy silhouette — no sphere clip, fully freeform.
 * Original: Galaxy.tscn.
 */
import type { PaletteDef } from "./types";

const palettes: PaletteDef[] = [
  {
    name: "Default",
    layers: [[
      [1.000, 1.000, 0.922], [1.000, 0.914, 0.553], [0.710, 0.878, 0.400],
      [0.396, 0.647, 0.400], [0.224, 0.365, 0.392], [0.196, 0.224, 0.302], [0.196, 0.161, 0.278],
    ]],
  },
  {
    name: "Cosmic",
    layers: [[
      [0.92, 0.96, 1.00], [0.70, 0.86, 1.00], [0.42, 0.64, 0.92],
      [0.20, 0.42, 0.82], [0.10, 0.22, 0.62], [0.05, 0.10, 0.36], [0.02, 0.04, 0.18],
    ]],
  },
  {
    name: "Nebula",
    layers: [[
      [1.00, 0.90, 0.96], [1.00, 0.60, 0.72], [0.92, 0.28, 0.50],
      [0.62, 0.08, 0.28], [0.36, 0.04, 0.16], [0.18, 0.02, 0.09], [0.08, 0.01, 0.04],
    ]],
  },
  {
    name: "Starfield",
    layers: [[
      [1.00, 1.00, 1.00], [0.88, 0.92, 0.96], [0.52, 0.62, 0.82],
      [0.30, 0.36, 0.58], [0.14, 0.18, 0.36], [0.06, 0.08, 0.20], [0.02, 0.03, 0.10],
    ]],
  },
  {
    name: "Void",
    layers: [[
      [0.72, 0.66, 0.92], [0.48, 0.42, 0.68], [0.26, 0.22, 0.48],
      [0.12, 0.10, 0.32], [0.06, 0.04, 0.18], [0.03, 0.02, 0.10], [0.01, 0.01, 0.05],
    ]],
  },
];

export default palettes;
