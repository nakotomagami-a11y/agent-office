/**
 * Palettes for the Star type.
 *
 * Three layers (all rendered on a 2× canvas so they can extend outside the disc):
 *   - blob corona (star-blobs shader, 1 color — circular blobs form a loose halo)
 *   - star body   (star-main shader,  4 colors — Voronoi cells, sphere-mapped)
 *   - solar flares(star-flares shader, 2 colors — spiky outward rays)
 *
 * The star-main layer remaps UV to the center half of the 2× canvas.
 * The blobs and flares render in full 2× space so they can overhang.
 * Original: Star.tscn.
 */
import type { PaletteDef } from "./types";

const palettes: PaletteDef[] = [
  {
    name: "Default",
    layers: [
      [[1.000, 1.000, 0.894]],
      [[0.961, 1.000, 0.910], [0.467, 0.839, 0.757], [0.110, 0.573, 0.655], [0.012, 0.243, 0.369]],
      [[0.467, 0.839, 0.757], [1.000, 1.000, 0.894]],
    ],
  },
  {
    name: "Solar",
    layers: [
      [[1.00, 1.00, 0.70]],
      [[1.00, 1.00, 0.70], [1.00, 0.80, 0.28], [1.00, 0.48, 0.08], [0.65, 0.18, 0.02]],
      [[1.00, 0.80, 0.28], [1.00, 1.00, 0.70]],
    ],
  },
  {
    name: "Red Dwarf",
    layers: [
      [[1.00, 0.78, 0.58]],
      [[1.00, 0.78, 0.58], [0.90, 0.40, 0.18], [0.68, 0.14, 0.04], [0.32, 0.04, 0.02]],
      [[0.90, 0.40, 0.18], [1.00, 0.78, 0.58]],
    ],
  },
  {
    name: "Blue Giant",
    layers: [
      [[0.80, 0.92, 1.00]],
      [[0.80, 0.92, 1.00], [0.40, 0.72, 1.00], [0.10, 0.42, 0.92], [0.02, 0.10, 0.52]],
      [[0.40, 0.72, 1.00], [0.80, 0.92, 1.00]],
    ],
  },
  {
    name: "Pulsar",
    layers: [
      [[0.90, 0.80, 1.00]],
      [[0.90, 0.80, 1.00], [0.60, 0.28, 0.92], [0.28, 0.08, 0.70], [0.10, 0.02, 0.42]],
      [[0.60, 0.28, 0.92], [0.90, 0.80, 1.00]],
    ],
  },
];

export default palettes;
