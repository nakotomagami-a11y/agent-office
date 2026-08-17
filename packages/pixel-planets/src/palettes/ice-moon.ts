/**
 * Palettes for the Ice Moon planet type.
 *
 * A frozen, airless body: terrain (frozen "continents" + shallow/deep ice)
 * plus an impact-crater overlay and — unlike Ice World — NO cloud layer. The
 * missing atmosphere plus the cratering is what distinguishes it from Ice
 * World (soft, clouded) and from Rocky (grey, no ice tones).
 *
 * Layer [0] terrain — 6 colors: 4 surface (bright → shadow) + 2 ice basin (shallow, deep)
 * Layer [1] craters — 2 colors: rim highlight / crater shadow
 */
import type { PaletteDef } from "./types";

const palettes: PaletteDef[] = [
  {
    name: "Default",
    layers: [
      [
        [0.925, 0.965, 1.000], [0.729, 0.808, 0.898], [0.510, 0.600, 0.729],
        [0.318, 0.396, 0.529], [0.400, 0.616, 0.749], [0.216, 0.376, 0.541],
      ],
      [[0.643, 0.729, 0.851], [0.322, 0.396, 0.529]],
    ],
  },
  {
    name: "Europa",
    layers: [
      [
        [0.90, 0.86, 0.78], [0.76, 0.70, 0.60], [0.58, 0.52, 0.44], [0.38, 0.34, 0.30],
        [0.62, 0.58, 0.52], [0.40, 0.36, 0.32],
      ],
      [[0.70, 0.66, 0.58], [0.40, 0.36, 0.30]],
    ],
  },
  {
    name: "Enceladus",
    layers: [
      [
        [0.98, 1.00, 1.00], [0.86, 0.92, 0.96], [0.68, 0.78, 0.86], [0.46, 0.58, 0.70],
        [0.60, 0.76, 0.88], [0.38, 0.56, 0.72],
      ],
      [[0.78, 0.86, 0.92], [0.48, 0.60, 0.72]],
    ],
  },
  {
    name: "Frozen Iron",
    layers: [
      [
        [0.78, 0.80, 0.86], [0.60, 0.62, 0.70], [0.44, 0.46, 0.54], [0.28, 0.30, 0.38],
        [0.46, 0.54, 0.66], [0.28, 0.36, 0.48],
      ],
      [[0.56, 0.58, 0.66], [0.30, 0.32, 0.40]],
    ],
  },
  {
    name: "Violet Ice",
    layers: [
      [
        [0.86, 0.82, 0.94], [0.70, 0.64, 0.82], [0.52, 0.46, 0.66], [0.34, 0.28, 0.46],
        [0.50, 0.54, 0.80], [0.30, 0.34, 0.58],
      ],
      [[0.62, 0.58, 0.74], [0.36, 0.30, 0.48]],
    ],
  },
];

export default palettes;
