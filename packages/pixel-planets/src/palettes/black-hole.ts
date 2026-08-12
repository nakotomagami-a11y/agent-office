/**
 * Palettes for the Black Hole type.
 *
 * Two layers:
 *   - dark sphere body with a thin glowing rim (3 colors: core / glow / bright edge)
 *   - accretion ring composited on top (5 colors: bright → dark, posterised by fbm)
 *
 * The renderer uses a 3× oversize canvas so the ring has room to extend
 * outside the sphere boundary. The body layer remaps its UV to occupy only
 * the center third of that larger canvas.
 * Original: BlackHole.tscn.
 */
import type { PaletteDef } from "./types";

const palettes: PaletteDef[] = [
  {
    name: "Default",
    layers: [
      [[0.153, 0.153, 0.212], [1.000, 1.000, 0.922], [0.929, 0.482, 0.224]],
      [[1.000, 1.000, 0.922], [1.000, 0.961, 0.251], [1.000, 0.722, 0.290], [0.929, 0.482, 0.224], [0.741, 0.251, 0.208]],
    ],
  },
  {
    name: "Solar Flare",
    layers: [
      [[0.08, 0.06, 0.05], [1.00, 0.92, 0.70], [1.00, 0.55, 0.20]],
      [[1.00, 0.92, 0.70], [1.00, 0.65, 0.10], [1.00, 0.35, 0.05], [0.85, 0.15, 0.03], [0.55, 0.06, 0.01]],
    ],
  },
  {
    name: "Blue Giant",
    layers: [
      [[0.05, 0.09, 0.20], [0.80, 0.90, 1.00], [0.35, 0.65, 1.00]],
      [[0.80, 0.90, 1.00], [0.50, 0.78, 1.00], [0.20, 0.58, 0.92], [0.08, 0.36, 0.80], [0.03, 0.18, 0.58]],
    ],
  },
  {
    name: "Quasar",
    layers: [
      [[0.10, 0.04, 0.18], [0.90, 0.80, 1.00], [0.68, 0.28, 0.92]],
      [[0.90, 0.80, 1.00], [0.76, 0.48, 1.00], [0.58, 0.18, 0.90], [0.38, 0.08, 0.70], [0.18, 0.03, 0.48]],
    ],
  },
  {
    name: "Emerald",
    layers: [
      [[0.04, 0.14, 0.12], [0.65, 1.00, 0.78], [0.18, 0.88, 0.48]],
      [[0.65, 1.00, 0.78], [0.28, 0.90, 0.50], [0.10, 0.68, 0.28], [0.04, 0.48, 0.16], [0.01, 0.28, 0.08]],
    ],
  },
];

export default palettes;
