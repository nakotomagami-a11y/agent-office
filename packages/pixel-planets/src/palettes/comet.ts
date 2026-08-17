/**
 * Palettes for the Comet planet type.
 *
 * A blazing meteor: a small molten cracked head trailing a long fiery tail.
 * The directional trail is the signature — nothing else in the set has one.
 * Rendered on a 2× canvas with a small disc so the tail has length.
 *
 * Layer [0] comet-tail  — 3 colors: hot core → orange mid → deep red outer wisp
 * Layer [1] rock        — 3 colors: charred head crust (light / mid / dark)
 * Layer [2] lava-rivers — 3 colors: glowing cracks on the head
 * Layer [3] embers      — 3 colors: hot core → dim outer spark
 */
import type { PaletteDef } from "./types";

const palettes: PaletteDef[] = [
  {
    name: "Default",
    layers: [
      [[1.00, 0.92, 0.62], [1.00, 0.52, 0.14], [0.72, 0.14, 0.04]],
      [[0.20, 0.16, 0.14], [0.13, 0.10, 0.09], [0.07, 0.05, 0.05]],
      [[1.00, 0.72, 0.28], [0.95, 0.40, 0.10], [0.62, 0.14, 0.04]],
      [[1.00, 0.90, 0.60], [1.00, 0.50, 0.15], [0.85, 0.25, 0.06]],
    ],
  },
  {
    name: "Blue Ion",
    layers: [
      [[0.80, 0.95, 1.00], [0.34, 0.68, 1.00], [0.10, 0.30, 0.72]],
      [[0.18, 0.19, 0.24], [0.11, 0.12, 0.16], [0.06, 0.06, 0.09]],
      [[0.66, 0.92, 1.00], [0.26, 0.60, 0.96], [0.10, 0.30, 0.66]],
      [[0.86, 0.96, 1.00], [0.42, 0.72, 1.00], [0.16, 0.40, 0.86]],
    ],
  },
  {
    name: "Emerald",
    layers: [
      [[0.80, 1.00, 0.66], [0.36, 0.86, 0.24], [0.12, 0.46, 0.10]],
      [[0.16, 0.20, 0.15], [0.10, 0.13, 0.09], [0.05, 0.07, 0.05]],
      [[0.70, 1.00, 0.42], [0.34, 0.82, 0.16], [0.14, 0.44, 0.08]],
      [[0.82, 1.00, 0.58], [0.42, 0.90, 0.24], [0.18, 0.52, 0.12]],
    ],
  },
  {
    name: "Amethyst",
    layers: [
      [[0.94, 0.80, 1.00], [0.64, 0.34, 0.92], [0.34, 0.12, 0.58]],
      [[0.20, 0.17, 0.22], [0.13, 0.10, 0.15], [0.07, 0.05, 0.09]],
      [[0.90, 0.66, 1.00], [0.56, 0.28, 0.88], [0.30, 0.10, 0.54]],
      [[0.94, 0.78, 1.00], [0.66, 0.38, 0.96], [0.38, 0.16, 0.66]],
    ],
  },
  {
    name: "Ashen",
    layers: [
      [[0.96, 0.90, 0.82], [0.72, 0.60, 0.50], [0.42, 0.32, 0.26]],
      [[0.22, 0.21, 0.21], [0.14, 0.13, 0.13], [0.07, 0.07, 0.07]],
      [[0.98, 0.72, 0.46], [0.80, 0.44, 0.22], [0.50, 0.22, 0.12]],
      [[1.00, 0.86, 0.66], [0.86, 0.56, 0.34], [0.60, 0.30, 0.16]],
    ],
  },
];

export default palettes;
