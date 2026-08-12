/**
 * Palettes for the Dry Planet type.
 *
 * Single terrain layer with 6 colors: 4 land + 2 shadow/deep-shadow.
 * river_cutoff=0 in the terrain shader means no water appears — all land.
 * Original: DryTerran.tscn.
 */
import type { PaletteDef } from "./types";

const palettes: PaletteDef[] = [
  {
    name: "Default",
    layers: [[
      [1.00, 0.537, 0.200], [0.902, 0.271, 0.224], [0.678, 0.184, 0.271],
      [0.322, 0.200, 0.247], [0.239, 0.161, 0.212], [0.157, 0.102, 0.137],
    ]],
  },
  {
    name: "Sahara",
    layers: [[
      [0.84, 0.70, 0.45], [0.70, 0.55, 0.32], [0.52, 0.40, 0.22], [0.32, 0.24, 0.12],
      [0.42, 0.30, 0.18], [0.26, 0.18, 0.10],
    ]],
  },
  {
    name: "Rust",
    layers: [[
      [0.78, 0.42, 0.26], [0.62, 0.30, 0.16], [0.44, 0.18, 0.09], [0.26, 0.10, 0.04],
      [0.34, 0.14, 0.07], [0.18, 0.07, 0.03],
    ]],
  },
  {
    name: "Dusk",
    layers: [[
      [0.60, 0.42, 0.70], [0.46, 0.30, 0.56], [0.30, 0.18, 0.40], [0.18, 0.10, 0.26],
      [0.36, 0.22, 0.48], [0.20, 0.12, 0.28],
    ]],
  },
  {
    name: "Jade",
    layers: [[
      [0.38, 0.62, 0.44], [0.26, 0.48, 0.32], [0.14, 0.32, 0.20], [0.07, 0.20, 0.11],
      [0.18, 0.36, 0.24], [0.09, 0.20, 0.13],
    ]],
  },
];

export default palettes;
