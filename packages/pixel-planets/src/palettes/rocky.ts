/**
 * Palettes for the Rocky planet type.
 *
 * Two layers: rock surface (3 colors: light/mid/dark) and crater overlay
 * (2 colors: rim highlight / shadow). Original: NoAtmosphere.tscn.
 */
import type { PaletteDef } from "./types";

const palettes: PaletteDef[] = [
  {
    name: "Default",
    layers: [
      [[0.639, 0.655, 0.761], [0.298, 0.408, 0.522], [0.227, 0.247, 0.369]],
      [[0.298, 0.408, 0.522], [0.227, 0.247, 0.369]],
    ],
  },
  {
    name: "Lunar",
    layers: [
      [[0.55, 0.54, 0.52], [0.40, 0.39, 0.37], [0.26, 0.25, 0.24]],
      [[0.34, 0.33, 0.32], [0.16, 0.15, 0.14]],
    ],
  },
  {
    name: "Mars",
    layers: [
      [[0.70, 0.36, 0.20], [0.52, 0.26, 0.14], [0.32, 0.14, 0.07]],
      [[0.42, 0.20, 0.10], [0.22, 0.10, 0.05]],
    ],
  },
  {
    name: "Obsidian",
    layers: [
      [[0.18, 0.16, 0.20], [0.12, 0.10, 0.14], [0.07, 0.06, 0.09]],
      [[0.24, 0.22, 0.26], [0.10, 0.08, 0.12]],
    ],
  },
  {
    name: "Amber",
    layers: [
      [[0.64, 0.44, 0.18], [0.48, 0.30, 0.10], [0.30, 0.18, 0.05]],
      [[0.40, 0.26, 0.08], [0.20, 0.12, 0.04]],
    ],
  },
];

export default palettes;
