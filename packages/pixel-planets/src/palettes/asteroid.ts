/**
 * Palettes for the Asteroid type.
 *
 * Single layer (asteroid shader, 3 colors: mid / dark / light).
 * The asteroid shader uses fbm noise + a distance threshold to create an
 * irregular rocky mass — no sphere clipping. Colors map to light, mid,
 * and shadow regions determined by a noise-offset lighting calculation.
 * Original: Asteroid.tscn.
 */
import type { PaletteDef } from "./types";

const palettes: PaletteDef[] = [
  {
    name: "Default",
    layers: [
      [[0.639, 0.655, 0.761], [0.298, 0.408, 0.522], [0.227, 0.247, 0.369]],
    ],
  },
  {
    name: "Moondust",
    layers: [
      [[0.62, 0.62, 0.62], [0.44, 0.44, 0.44], [0.26, 0.26, 0.26]],
    ],
  },
  {
    name: "Copper",
    layers: [
      [[0.68, 0.48, 0.32], [0.50, 0.34, 0.20], [0.30, 0.18, 0.08]],
    ],
  },
  {
    name: "Obsidian",
    layers: [
      [[0.22, 0.20, 0.28], [0.14, 0.12, 0.18], [0.07, 0.06, 0.10]],
    ],
  },
  {
    name: "Sandstone",
    layers: [
      [[0.76, 0.66, 0.48], [0.56, 0.46, 0.30], [0.36, 0.28, 0.16]],
    ],
  },
];

export default palettes;
