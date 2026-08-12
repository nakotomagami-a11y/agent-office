/**
 * Parameter builder: converts a `PlanetConfig` into `PlanetParams`.
 *
 * `getPlanetParams` is the main entry point. It handles:
 *   - Picking the right layer templates for the planet type
 *   - Resolving palette colors into flat RGBA arrays
 *   - Generating a fallback procedural appearance when no config is supplied
 *   - Seeding all RNG from the config's integer seed for determinism
 */
import type { PlanetType, PlanetParams, PlanetLayer, ShaderName } from "./types";
import { PLANET_TYPE_DEFS } from "./palettes/index";
import {
  mulberry32, hashProjectId, toRGBA, cosineScheme, darkened, lightened, shiftHue,
  type RGB,
} from "./math";

// Layer templates

/**
 * Defines the shader and timing for each layer of a planet type.
 * This is the "shape" of the type — the palette fills in the actual colors.
 *
 * `timeScaleFactor` and `timeSpeed` are combined in makeTimeScale() to
 * produce the `timeScale` field on PlanetLayer. Separating them lets us
 * tune animation speed independently of the domain-size parameter.
 */
interface LayerTemplate {
  shader: ShaderName;
  cloudCover?: number;
  riverCutoff?: number;
  landCutoff?: number;
  /** Multiplied by `(size * 2 / timeSpeed)` to get the final time scale. */
  timeScaleFactor: number;
  /** Shader-internal time speed uniform (how fast the pattern scrolls). */
  timeSpeed: number;
}

export const LAYER_TEMPLATES: Record<PlanetType, LayerTemplate[]> = {
  "gas-giant": [
    { shader: "gas",      cloudCover: 0.00, timeScaleFactor: 0.005, timeSpeed: 0.7  },
    { shader: "gas",      cloudCover: 0.35, timeScaleFactor: 0.005, timeSpeed: 0.47 },
    { shader: "gas-ring",               timeScaleFactor: 0.003, timeSpeed: 0.2  },
  ],
  "rocky": [
    { shader: "rock",    timeScaleFactor: 0.02,  timeSpeed: 0.2   },
    { shader: "craters", timeScaleFactor: 0.02,  timeSpeed: 0.001 },
  ],
  "dry": [
    { shader: "terrain", riverCutoff: 0.0, timeScaleFactor: 0.02, timeSpeed: 0.2 },
  ],
  "terran": [
    { shader: "terrain", riverCutoff: 0.368, timeScaleFactor: 0.02,  timeSpeed: 0.2  },
    { shader: "gas",     cloudCover:  0.47,  timeScaleFactor: 0.005, timeSpeed: 0.7  },
  ],
  "ice": [
    { shader: "terrain", riverCutoff: 0.48, timeScaleFactor: 0.02,  timeSpeed: 0.2 },
    { shader: "gas",     cloudCover:  0.45, timeScaleFactor: 0.005, timeSpeed: 0.7 },
  ],
  "islands": [
    { shader: "rock",     timeScaleFactor: 0.02,  timeSpeed: 0.2  },
    { shader: "landmass", landCutoff: 0.633, timeScaleFactor: 0.02,  timeSpeed: 0.2  },
    { shader: "gas",      cloudCover: 0.415, timeScaleFactor: 0.005, timeSpeed: 0.47 },
  ],
  "lava": [
    { shader: "rock",        timeScaleFactor: 0.02, timeSpeed: 0.2   },
    { shader: "craters",     timeScaleFactor: 0.02, timeSpeed: 0.001 },
    { shader: "lava-rivers", riverCutoff: 0.579, timeScaleFactor: 0.02, timeSpeed: 0.2 },
  ],
  "asteroid": [
    // Static — asteroid position is seed-based, not time-animated
    { shader: "asteroid", timeScaleFactor: 0.0, timeSpeed: 1.0 },
  ],
  "black-hole": [
    { shader: "black-hole-body", timeScaleFactor: 0.0,   timeSpeed: 1.0 },
    { shader: "black-hole-ring", timeScaleFactor: 0.004, timeSpeed: 0.2 },
  ],
  "galaxy": [
    { shader: "galaxy", timeScaleFactor: 0.002, timeSpeed: 1.0 },
  ],
  "star": [
    { shader: "star-blobs",  timeScaleFactor: 0.002, timeSpeed: 0.05 },
    { shader: "star-main",   timeScaleFactor: 0.001, timeSpeed: 0.05 },
    { shader: "star-flares", timeScaleFactor: 0.002, timeSpeed: 0.05 },
  ],
};

/**
 * Types that render outside the circular clip boundary.
 * Includes black-hole (accretion ring) and gas-giant (Saturn ring).
 */
export const FREEFORM_TYPES = new Set<PlanetType>(["asteroid", "galaxy", "star", "black-hole", "gas-giant"]);

/**
 * Oversize multipliers for types whose effects extend beyond the planet disc.
 *
 * The WebGL offscreen canvas is `discSize × canvasScale`. The display canvas
 * is also `discSize × canvasScale` so the disc appears at `discSize` pixels
 * and the surrounding effects (blobs, flares, ring) fill the extra space.
 */
export const CANVAS_SCALE: Partial<Record<PlanetType, number>> = {
  "black-hole": 3,
  "gas-giant":  2,
  "star": 2,
};

// Helpers

/**
 * Combine `timeScaleFactor` and `timeSpeed` into the final `timeScale` value
 * that the renderer multiplies against elapsed seconds.
 *
 * The formula ensures that changing `size` (noise domain scale) keeps the
 * animation speed visually consistent across planet sizes.
 */
function makeTimeScale(size: number, tmpl: LayerTemplate): number {
  return (Math.round(size) * 2 / tmpl.timeSpeed) * tmpl.timeScaleFactor;
}

// Fallback procedural generation (used when no PlanetConfig is provided)

/**
 * Build layers for a planet type using randomly generated colors.
 *
 * This is the code path taken when a project has no saved planet config —
 * the planet still looks good, it's just not reproducible across sessions.
 * Uses the cosine palette scheme for visually harmonious color generation.
 */
function getFallbackLayers(type: PlanetType, rng: () => number, size: number): PlanetLayer[] {
  const templates = LAYER_TEMPLATES[type];

  switch (type) {
    case "gas-giant": {
      const base = cosineScheme(Math.floor(rng() * 4) + 8, rng() * 0.5 + 0.3, 1.0, rng);
      const cols1 = Array.from({ length: 4 }, (_, i) => darkened(darkened(base[i]!, i / 6), 0.7));
      const cols2 = Array.from({ length: 4 }, (_, i) => lightened(darkened(base[i + 4]!, i / 4), (1 - i / 4) * 0.5));
      // Ring: 3 bright colors (light tones from the outer base) + 3 dark colors
      const ringBright = [lightened(base[5]!, 0.3), lightened(base[6]!, 0.2), lightened(base[7]!, 0.1)] as RGB[];
      const ringDark   = [darkened(base[0]!, 0.35), darkened(base[1]!, 0.45), darkened(base[2]!, 0.55)] as RGB[];
      return [
        { shader: "gas",      colors: toRGBA(cols1), cloudCover: 0.0,                 timeScale: makeTimeScale(size, templates[0]!) },
        { shader: "gas",      colors: toRGBA(cols2), cloudCover: rng() * 0.22 + 0.28, timeScale: makeTimeScale(size, templates[1]!) },
        { shader: "gas-ring", colors: toRGBA([...ringBright, ...ringDark]),            timeScale: makeTimeScale(size, templates[2]!) },
      ];
    }
    case "rocky": {
      const base = cosineScheme(Math.floor(rng() * 2) + 2, rng() * 0.5 + 0.5, rng() * 0.5 + 0.3, rng);
      const rockColors   = Array.from({ length: 3 }, (_, i) => shiftHue(darkened(base[0]!, i / 4), 0.02 * (i / 3))) as RGB[];
      const craterColors = Array.from({ length: 2 }, (_, i) => shiftHue(darkened(base[base.length - 1]!, i / 5), 0.02 * (i / 2))) as RGB[];
      return [
        { shader: "rock",    colors: toRGBA(rockColors),   timeScale: makeTimeScale(size, templates[0]!) },
        { shader: "craters", colors: toRGBA(craterColors), timeScale: makeTimeScale(size, templates[1]!) },
      ];
    }
    case "dry": {
      const base = cosineScheme(4, rng() * 0.5 + 0.3, 0.7, rng);
      const landColors   = Array.from({ length: 4 }, (_, i) => darkened(base[i]!, i / 5)) as RGB[];
      const shadowColors = [darkened(landColors[2]!, 0.1), darkened(landColors[3]!, 0.1)] as RGB[];
      return [{ shader: "terrain", colors: toRGBA([...landColors, ...shadowColors]), riverCutoff: 0.0, timeScale: makeTimeScale(size, templates[0]!) }];
    }
    case "terran": {
      const base = cosineScheme(3, rng() * 0.3 + 0.7, 0.5, rng);
      const landColors  = Array.from({ length: 4 }, (_, i) => shiftHue(darkened(base[0]!, i / 4), 0.02 * (i / 4))) as RGB[];
      const waterColors = [shiftHue(darkened(base[1]!, 0.1), 0.05), shiftHue(darkened(base[1]!, 0.3), 0.08)] as RGB[];
      const cloudColors = Array.from({ length: 4 }, (_, i) => lightened(darkened(base[2]!, i / 4), (1 - i / 4) * 0.6)) as RGB[];
      return [
        { shader: "terrain", colors: toRGBA([...landColors, ...waterColors]), riverCutoff: 0.368, timeScale: makeTimeScale(size, templates[0]!) },
        { shader: "gas",     colors: toRGBA(cloudColors),                     cloudCover: 0.47,   timeScale: makeTimeScale(size, templates[1]!) },
      ];
    }
    case "ice": {
      const base = cosineScheme(3, 0.2, 0.3, rng);
      const iceColors   = [[0.7 + rng() * 0.2, 0.75 + rng() * 0.15, 0.85 + rng() * 0.1], [0.55, 0.65, 0.78], [0.38, 0.48, 0.62], [0.22, 0.30, 0.44]] as RGB[];
      const oceanColors = [[0.25, 0.45 + rng() * 0.15, 0.70], [0.14, 0.28, 0.52]] as RGB[];
      const cloudColors = Array.from({ length: 4 }, (_, i) => lightened(darkened(base[2] ?? [0.7, 0.75, 0.8], i / 4), (1 - i / 4) * 0.5)) as RGB[];
      return [
        { shader: "terrain", colors: toRGBA([...iceColors, ...oceanColors]), riverCutoff: 0.48, timeScale: makeTimeScale(size, templates[0]!) },
        { shader: "gas",     colors: toRGBA(cloudColors),                    cloudCover:  0.45, timeScale: makeTimeScale(size, templates[1]!) },
      ];
    }
    case "islands": {
      const base = cosineScheme(3, rng() * 0.3 + 0.7, 0.5, rng);
      const oceanColors = Array.from({ length: 3 }, (_, i) => darkened(base[1]!, i / 4)) as RGB[];
      const landColors  = Array.from({ length: 4 }, (_, i) => shiftHue(darkened(base[0]!, i / 4), 0.02 * (i / 4))) as RGB[];
      const cloudColors = Array.from({ length: 4 }, (_, i) => lightened(darkened(base[2]!, i / 4), (1 - i / 4) * 0.6)) as RGB[];
      return [
        { shader: "rock",     colors: toRGBA(oceanColors),                              timeScale: makeTimeScale(size, templates[0]!) },
        { shader: "landmass", colors: toRGBA(landColors), landCutoff: 0.5 + rng() * 0.2, timeScale: makeTimeScale(size, templates[1]!) },
        { shader: "gas",      colors: toRGBA(cloudColors), cloudCover: 0.4 + rng() * 0.1, timeScale: makeTimeScale(size, templates[2]!) },
      ];
    }
    case "lava": {
      const base = cosineScheme(2, rng() * 0.4 + 0.6, 0.75, rng);
      const landColors   = Array.from({ length: 3 }, (_, i) => darkened(base[0]!, 0.3 + i * 0.15)) as RGB[];
      const craterColors = [darkened(landColors[1]!, 0.1), darkened(landColors[2]!, 0.1)] as RGB[];
      const lavaColors   = [[1.0, 0.5 + rng() * 0.2, 0.1], [0.9, 0.25, 0.05], [0.65, 0.15, 0.05]] as RGB[];
      return [
        { shader: "rock",        colors: toRGBA(landColors),   timeScale: makeTimeScale(size, templates[0]!) },
        { shader: "craters",     colors: toRGBA(craterColors), timeScale: makeTimeScale(size, templates[1]!) },
        { shader: "lava-rivers", colors: toRGBA(lavaColors), riverCutoff: 0.55 + rng() * 0.1, timeScale: makeTimeScale(size, templates[2]!) },
      ];
    }
    case "asteroid": {
      const base = cosineScheme(3, rng() * 0.5 + 0.3, 0.5, rng);
      const colors = Array.from({ length: 3 }, (_, i) => darkened(base[i % base.length]!, 0.2 + i * 0.15)) as RGB[];
      return [{ shader: "asteroid", colors: toRGBA(colors), timeScale: 0 }];
    }
    case "black-hole": {
      const base = cosineScheme(3, rng() * 0.4 + 0.6, 1.0, rng);
      const bodyColors = [[0.1, 0.08, 0.15], lightened(base[0]!, 0.3), base[0]!] as RGB[];
      const ringColors = Array.from({ length: 5 }, (_, i) => lightened(darkened(base[1 % base.length]!, i / 6), (1 - i / 5) * 0.8)) as RGB[];
      return [
        { shader: "black-hole-body", colors: toRGBA(bodyColors), timeScale: 0 },
        { shader: "black-hole-ring", colors: toRGBA(ringColors), timeScale: makeTimeScale(size, LAYER_TEMPLATES["black-hole"][1]!) },
      ];
    }
    case "galaxy": {
      const base = cosineScheme(4, rng() * 0.6 + 0.4, 0.8, rng);
      const galaxyColors = [
        lightened(base[0]!, 0.4), base[0]!, base[1]!, base[2]!,
        darkened(base[2]!, 0.2), darkened(base[3]!, 0.3), darkened(base[3]!, 0.55),
      ] as RGB[];
      return [{ shader: "galaxy", colors: toRGBA(galaxyColors), timeScale: makeTimeScale(size, LAYER_TEMPLATES["galaxy"][0]!) }];
    }
    case "star": {
      const base = cosineScheme(3, rng() * 0.3 + 0.6, 1.0, rng);
      const blobColor  = lightened(base[0]!, 0.6);
      const starColors = [lightened(base[0]!, 0.5), base[0]!, base[1]!, darkened(base[2]!, 0.2)] as RGB[];
      const flareColors = [base[1]!, lightened(base[0]!, 0.5)] as RGB[];
      return [
        { shader: "star-blobs",  colors: toRGBA([blobColor]),  timeScale: makeTimeScale(size, LAYER_TEMPLATES["star"][0]!) },
        { shader: "star-main",   colors: toRGBA(starColors),   timeScale: makeTimeScale(size, LAYER_TEMPLATES["star"][1]!) },
        { shader: "star-flares", colors: toRGBA(flareColors),  timeScale: makeTimeScale(size, LAYER_TEMPLATES["star"][2]!) },
      ];
    }
  }
}

// Main API

/**
 * Convert a `PlanetConfig` into `PlanetParams` ready for the WebGL renderer.
 *
 * When called without a `config`, produces a stable random planet seeded from
 * `projectId` — useful for showing a planet before the user has configured one.
 *
 * @param projectId  Used to seed the RNG when no config is provided.
 * @param config     Optional explicit planet configuration.
 */
export function getPlanetParams(projectId: string, config?: PlanetConfig): PlanetParams {
  const h = hashProjectId(projectId);
  const rng = mulberry32(h);

  // Most shaders share these defaults; specialised layers override per-draw
  const size = 9.0;
  const octaves = 5;

  if (!config) {
    // No config — generate a random gas-giant or rocky planet from the project seed
    const type: PlanetType = rng() < 0.5 ? "gas-giant" : "rocky";
    const seed = (h % 1000) / 100.0;
    const rotation = rng() * Math.PI * 2;
    const layers = getFallbackLayers(type, rng, size);
    return { type, layers, seed, rotation, pixels: 50, size, octaves, dither: true, canvasScale: CANVAS_SCALE[type] ?? 1 };
  }

  const { type, seed: intSeed, paletteIdx } = config;
  const typeDef = PLANET_TYPE_DEFS[type];
  const palette = typeDef.palettes[paletteIdx % typeDef.palettes.length]!;
  const templates = LAYER_TEMPLATES[type];

  // Clamp seed to a safe positive integer, then derive float GLSL seed
  const safeSeed = Math.max(1, intSeed) >>> 0;
  const seedRng  = mulberry32(safeSeed);
  const rotation = config.rotation ?? seedRng() * Math.PI * 2;
  const shaderSeed = Math.max(0.01, (safeSeed % 1000) / 100.0);
  const pixels = config.pixels ?? 50;
  const dither = config.dither ?? true;

  const layers: PlanetLayer[] = templates.map((tmpl, i) => {
    const paletteColors = (config.customPalette?.[i] ?? palette.layers[i] ?? palette.layers[0]!) as RGB[];
    let cloudCover = tmpl.cloudCover;
    // Vary cloud coverage slightly per seed so clouds look different on each planet
    if (tmpl.shader === "gas" && cloudCover !== undefined && cloudCover > 0) {
      cloudCover = cloudCover + (seedRng() * 0.1 - 0.05);
    }
    return {
      shader: tmpl.shader,
      colors: toRGBA(paletteColors),
      cloudCover,
      riverCutoff: tmpl.riverCutoff,
      landCutoff:  tmpl.landCutoff,
      timeScale: makeTimeScale(size, tmpl),
    };
  });

  return {
    type,
    layers,
    seed: shaderSeed,
    rotation,
    pixels,
    size,
    octaves,
    dither,
    canvasScale: CANVAS_SCALE[type] ?? 1,
  };
}

// Avoid importing PlanetConfig from types to keep this file self-contained
import type { PlanetConfig } from "./types";
