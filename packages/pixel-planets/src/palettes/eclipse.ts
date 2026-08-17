/**
 * Palettes for the Eclipse planet type.
 *
 * A near-black planet silhouette backlit by a thin, bright "ring of fire"
 * corona hugging its edge, with scattered sparks drifting around it — the
 * total-eclipse / ring-of-fire look. Built entirely from reused shaders: a
 * dark rock body, a tight atmo-glow ring, and embers.
 *
 * Layer [0] rock      — 3 colors: near-black body (barely any surface texture)
 * Layer [1] atmo-glow — 3 colors: bright inner rim → hot mid → dark outer fade
 * Layer [2] embers    — 3 colors: hot core → dim outer spark
 */
import type { PaletteDef } from "./types";

const palettes: PaletteDef[] = [
  {
    name: "Ring of Fire",
    layers: [
      [[0.055, 0.047, 0.055], [0.031, 0.027, 0.031], [0.016, 0.012, 0.016]],
      [[1.000, 0.860, 0.520], [1.000, 0.420, 0.120], [0.560, 0.100, 0.030]],
      [[1.000, 0.900, 0.600], [1.000, 0.500, 0.150], [0.850, 0.250, 0.060]],
    ],
  },
  {
    name: "Blue Corona",
    layers: [
      [[0.043, 0.047, 0.063], [0.024, 0.027, 0.039], [0.012, 0.014, 0.020]],
      [[0.760, 0.920, 1.000], [0.240, 0.560, 1.000], [0.060, 0.180, 0.560]],
      [[0.820, 0.940, 1.000], [0.320, 0.640, 1.000], [0.120, 0.320, 0.800]],
    ],
  },
  {
    name: "Emerald",
    layers: [
      [[0.043, 0.055, 0.043], [0.024, 0.031, 0.024], [0.012, 0.016, 0.012]],
      [[0.720, 1.000, 0.560], [0.260, 0.880, 0.300], [0.060, 0.440, 0.140]],
      [[0.800, 1.000, 0.640], [0.360, 0.940, 0.360], [0.140, 0.520, 0.180]],
    ],
  },
  {
    name: "Violet Void",
    layers: [
      [[0.055, 0.043, 0.063], [0.031, 0.024, 0.039], [0.016, 0.012, 0.020]],
      [[0.940, 0.720, 1.000], [0.640, 0.280, 0.980], [0.320, 0.080, 0.560]],
      [[0.960, 0.800, 1.000], [0.700, 0.360, 1.000], [0.400, 0.140, 0.700]],
    ],
  },
  {
    name: "Diamond",
    layers: [
      [[0.051, 0.051, 0.055], [0.028, 0.028, 0.031], [0.014, 0.014, 0.016]],
      [[1.000, 1.000, 0.960], [0.820, 0.860, 1.000], [0.360, 0.400, 0.560]],
      [[1.000, 1.000, 0.980], [0.880, 0.920, 1.000], [0.480, 0.520, 0.680]],
    ],
  },
];

export default palettes;
