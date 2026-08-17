/**
 * Parameter builder: converts a `PlanetConfig` into `PlanetParams`.
 *
 * `getPlanetParams` is the main entry point. It handles:
 *   - Picking the right layer templates for the planet type
 *   - Resolving palette colors into flat RGBA arrays
 *   - Generating a fallback procedural appearance when no config is supplied
 *   - Seeding all RNG from the config's integer seed for determinism
 */
import type { PlanetType, PlanetParams, PlanetLayer, ShaderName, PlanetParamDef } from "./types";
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
  glow?: number;
  /** Multiplied by `(size * 2 / timeSpeed)` to get the final time scale. */
  timeScaleFactor: number;
  /** Shader-internal time speed uniform (how fast the pattern scrolls). */
  timeSpeed: number;
}

/**
 * Hard ceiling for atmo-glow intensity. Glow is randomized 0..GLOW_MAX on
 * generation and the editor slider caps here — there is no way to exceed it.
 */
export const GLOW_MAX = 0.56;

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
  "terran": [
    { shader: "terrain", riverCutoff: 0.368, timeScaleFactor: 0.02,  timeSpeed: 0.2  },
    { shader: "gas",     cloudCover:  0.47,  timeScaleFactor: 0.005, timeSpeed: 0.7  },
  ],
  "ringed-terran": [
    { shader: "terrain",  riverCutoff: 0.368, timeScaleFactor: 0.02,  timeSpeed: 0.2  },
    { shader: "gas",      cloudCover:  0.47,  timeScaleFactor: 0.005, timeSpeed: 0.7  },
    { shader: "gas-ring",                     timeScaleFactor: 0.003, timeSpeed: 0.2  },
  ],
  "toxic": [
    // Distinct from Terran by the GASES AROUND IT, not the surface: a visible
    // marbled surface + light cloud swirl, wrapped in a glowing atmospheric
    // corona (atmo-glow) and a faint close-hugging ring (gas-ring). Rendered on
    // a 2× canvas (CANVAS_SCALE) with a near-full-size disc (DISC_SHRINK) so the
    // corona/ring sit right against a slightly-bigger planet.
    { shader: "terrain",   riverCutoff: 0.30, timeScaleFactor: 0.02,  timeSpeed: 0.2  },
    { shader: "gas",       cloudCover:  0.40, timeScaleFactor: 0.005, timeSpeed: 0.5  },
    { shader: "atmo-glow", glow: 0.35,        timeScaleFactor: 0.004, timeSpeed: 0.15 },
    { shader: "atmo-ring",                    timeScaleFactor: 0.003, timeSpeed: 0.2  },
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
    // Molten world: cratered basalt + lava channels, with surface eruptions
    // (explosions) AND ejecta plumes flung off the rim. 2× canvas + full-size
    // disc (DISC_SHRINK 1.0) so the ejecta has room outside the silhouette.
    { shader: "rock",        timeScaleFactor: 0.02, timeSpeed: 0.2   },
    { shader: "craters",     timeScaleFactor: 0.02, timeSpeed: 0.001 },
    { shader: "lava-rivers", riverCutoff: 0.579, timeScaleFactor: 0.02, timeSpeed: 0.2 },
    { shader: "explosions",  timeScaleFactor: 0.02, timeSpeed: 0.5 },
    { shader: "ejecta",      timeScaleFactor: 0.02, timeSpeed: 0.6 },
  ],
  "ice-moon": [
    { shader: "terrain", riverCutoff: 0.42, timeScaleFactor: 0.02, timeSpeed: 0.2   },
    { shader: "craters",                    timeScaleFactor: 0.02, timeSpeed: 0.001 },
  ],
  "eclipse": [
    // A near-black body backlit by a proper eclipse corona: ring of fire +
    // radiating streamers + a diamond-ring bead, with drifting sparks. 2× canvas.
    { shader: "rock",            timeScaleFactor: 0.02,  timeSpeed: 0.2  },
    { shader: "eclipse-corona",  timeScaleFactor: 0.004, timeSpeed: 0.2  },
    { shader: "embers",          timeScaleFactor: 0.02,  timeSpeed: 1.6  },
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
  "comet": [
    // A blazing meteor: a molten cracked head trailing a long fiery tail
    // (comet-tail, drawn first/behind) with sparks (embers). 2× canvas + a small
    // disc (DISC_SHRINK) so the tail is long. The directional trail is the
    // signature — nothing else in the set has one.
    { shader: "comet-tail",  timeScaleFactor: 0.02,  timeSpeed: 0.5 },
    { shader: "rock",        timeScaleFactor: 0.02,  timeSpeed: 0.2 },
    { shader: "lava-rivers", riverCutoff: 0.5, timeScaleFactor: 0.02, timeSpeed: 0.2 },
    { shader: "embers",      timeScaleFactor: 0.02,  timeSpeed: 1.6 },
  ],
};

/**
 * Adjustable per-type knobs, surfaced as sliders in the planet editor.
 *
 * Each entry maps to a `{ layer, field }` of that type's LAYER_TEMPLATES.
 * `default` mirrors the template value (in intuitive units — see PlanetParamDef)
 * so a fresh planet looks identical whether or not the user touches a slider.
 * Types absent from this map simply expose no knobs.
 */
export const PLANET_PARAM_DEFS: Partial<Record<PlanetType, PlanetParamDef[]>> = {
  "gas-giant": [
    { key: "clouds", label: "Cloud Density", layer: 1, field: "cloudCover",  min: 0.1, max: 0.9, step: 0.01, default: 0.65, invert: true },
  ],
  "terran": [
    { key: "water",  label: "Water Level",   layer: 0, field: "riverCutoff", min: 0.0, max: 0.9,  step: 0.01, default: 0.368 },
    { key: "clouds", label: "Cloud Density", layer: 1, field: "cloudCover",  min: 0.1, max: 0.9,  step: 0.01, default: 0.53, invert: true },
  ],
  "ringed-terran": [
    { key: "water",  label: "Water Level",   layer: 0, field: "riverCutoff", min: 0.0, max: 0.9,  step: 0.01, default: 0.368 },
    { key: "clouds", label: "Cloud Density", layer: 1, field: "cloudCover",  min: 0.1, max: 0.9,  step: 0.01, default: 0.53, invert: true },
  ],
  "toxic": [
    { key: "seas",   label: "Chem Seas",     layer: 0, field: "riverCutoff", min: 0.0, max: 0.8, step: 0.01, default: 0.30 },
    { key: "haze",   label: "Cloud Swirl",   layer: 1, field: "cloudCover",  min: 0.1, max: 0.9, step: 0.01, default: 0.60, invert: true },
    { key: "glow",   label: "Glow",          layer: 2, field: "glow",        min: 0.0, max: 0.56, step: 0.01, default: 0.28, displayMax: 1.0 },
  ],
  "ice": [
    { key: "ice",    label: "Ice Coverage",  layer: 0, field: "riverCutoff", min: 0.0, max: 0.9,  step: 0.01, default: 0.48 },
    { key: "clouds", label: "Cloud Density", layer: 1, field: "cloudCover",  min: 0.1, max: 0.9,  step: 0.01, default: 0.55, invert: true },
  ],
  "ice-moon": [
    { key: "ice",    label: "Ice Coverage",  layer: 0, field: "riverCutoff", min: 0.0, max: 0.9,  step: 0.01, default: 0.42 },
  ],
  "islands": [
    { key: "land",   label: "Land Coverage", layer: 1, field: "landCutoff",  min: 0.15, max: 0.85, step: 0.01, default: 0.367, invert: true },
    { key: "clouds", label: "Cloud Density", layer: 2, field: "cloudCover",  min: 0.1, max: 0.9,  step: 0.01, default: 0.585, invert: true },
  ],
  "lava": [
    { key: "lava",   label: "Lava Flow",     layer: 2, field: "riverCutoff", min: 0.1, max: 0.9,  step: 0.01, default: 0.421, invert: true },
  ],
  "comet": [
    { key: "cracks", label: "Lava Cracks",   layer: 2, field: "riverCutoff", min: 0.1, max: 0.9,  step: 0.01, default: 0.50, invert: true },
  ],
};

/** Translate a slider value (intuitive units) into the raw shader field value. */
function resolveParamField(def: PlanetParamDef, raw: number): number {
  const v = Math.min(def.max, Math.max(def.min, raw));
  return def.invert ? def.min + def.max - v : v;
}

/**
 * Types that render outside the circular clip boundary.
 * Includes black-hole (accretion ring) and gas-giant (Saturn ring).
 */
export const FREEFORM_TYPES = new Set<PlanetType>(["asteroid", "galaxy", "star", "black-hole", "gas-giant", "ringed-terran", "toxic", "eclipse", "comet", "lava"]);

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
  "ringed-terran": 2,
  "toxic": 2,
  "eclipse": 2,
  "comet": 2,
  "star": 2,
  "lava": 2,
};

/**
 * Per-type disc shrink factor for oversized-canvas surface layers (see
 * PlanetParams.discShrink). Defaults to 0.7 (leaves room for a far Saturn ring);
 * toxic keeps the body near full size so its corona/ring hug the surface.
 */
export const DISC_SHRINK: Partial<Record<PlanetType, number>> = {
  "toxic": 1.0,
  "lava": 1.0,
  "eclipse": 0.78,
  "comet": 0.6,
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

/**
 * Solid-sphere types that get the `shade` overlay (a lit-ball terminator + limb
 * darkening) composited last for 3D depth. Excludes self-luminous / freeform
 * types (star, black-hole, galaxy, asteroid, comet), the already-dark eclipse,
 * and the effect-heavy fiery worlds (lava, toxic) whose own glow
 * carries the depth.
 */
const SHADED_TYPES = new Set<PlanetType>([
  "gas-giant", "rocky", "terran", "ringed-terran", "ice", "islands", "ice-moon",
]);

/** Depth overlay layer — colours unused (the shader outputs a dark alpha ramp). */
function shadeLayer(): PlanetLayer {
  return { shader: "shade", colors: [], timeScale: 0 };
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
    case "ringed-terran": {
      const base = cosineScheme(3, rng() * 0.3 + 0.7, 0.5, rng);
      const landColors  = Array.from({ length: 4 }, (_, i) => shiftHue(darkened(base[0]!, i / 4), 0.02 * (i / 4))) as RGB[];
      const waterColors = [shiftHue(darkened(base[1]!, 0.1), 0.05), shiftHue(darkened(base[1]!, 0.3), 0.08)] as RGB[];
      const cloudColors = Array.from({ length: 4 }, (_, i) => lightened(darkened(base[2]!, i / 4), (1 - i / 4) * 0.6)) as RGB[];
      const ringBright  = [lightened(base[2]!, 0.4), lightened(base[2]!, 0.25), base[2]!] as RGB[];
      const ringDark    = [darkened(base[1]!, 0.35), darkened(base[1]!, 0.5), darkened(base[0]!, 0.6)] as RGB[];
      return [
        { shader: "terrain",  colors: toRGBA([...landColors, ...waterColors]), riverCutoff: 0.368, timeScale: makeTimeScale(size, templates[0]!) },
        { shader: "gas",      colors: toRGBA(cloudColors),                     cloudCover: 0.47,   timeScale: makeTimeScale(size, templates[1]!) },
        { shader: "gas-ring", colors: toRGBA([...ringBright, ...ringDark]),                        timeScale: makeTimeScale(size, templates[2]!) },
      ];
    }
    case "toxic": {
      const base = cosineScheme(3, rng() * 0.3 + 0.5, 0.55, rng);
      const landColors  = Array.from({ length: 4 }, (_, i) => shiftHue(darkened(base[0]!, i / 4), 0.03 * (i / 4))) as RGB[];
      const seaColors   = [shiftHue(darkened(base[1]!, 0.2), 0.06), shiftHue(darkened(base[1]!, 0.45), 0.09)] as RGB[];
      const cloudColors = Array.from({ length: 4 }, (_, i) => lightened(darkened(base[0]!, i / 4), (1 - i / 4) * 0.5)) as RGB[];
      const glowColors  = [lightened(base[2]!, 0.5), base[2]!, darkened(base[2]!, 0.4)] as RGB[];
      const ringColors  = [lightened(base[2]!, 0.4), base[2]!, darkened(base[2]!, 0.35)] as RGB[];
      return [
        { shader: "terrain",   colors: toRGBA([...landColors, ...seaColors]), riverCutoff: 0.30, timeScale: makeTimeScale(size, templates[0]!) },
        { shader: "gas",       colors: toRGBA(cloudColors),                   cloudCover: 0.40,  timeScale: makeTimeScale(size, templates[1]!) },
        { shader: "atmo-glow", colors: toRGBA(glowColors),                    glow: 0.35,        timeScale: makeTimeScale(size, templates[2]!) },
        { shader: "atmo-ring", colors: toRGBA(ringColors),                                       timeScale: makeTimeScale(size, templates[3]!) },
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
      const blastColors  = [[1.0, 0.98, 0.85], [1.0, 0.8, 0.3], [1.0, 0.48, 0.12], [0.86, 0.24, 0.1]] as RGB[];
      return [
        { shader: "rock",        colors: toRGBA(landColors),   timeScale: makeTimeScale(size, templates[0]!) },
        { shader: "craters",     colors: toRGBA(craterColors), timeScale: makeTimeScale(size, templates[1]!) },
        { shader: "lava-rivers", colors: toRGBA(lavaColors), riverCutoff: 0.55 + rng() * 0.1, timeScale: makeTimeScale(size, templates[2]!) },
        { shader: "explosions",  colors: toRGBA(blastColors),  timeScale: makeTimeScale(size, templates[3]!) },
        { shader: "ejecta",      colors: toRGBA(blastColors),  timeScale: makeTimeScale(size, templates[4]!) },
      ];
    }
    case "ice-moon": {
      const iceColors = [
        [0.90 + rng() * 0.08, 0.94, 1.0], [0.72, 0.80, 0.90], [0.50, 0.60, 0.73], [0.30, 0.38, 0.52],
        [0.40, 0.62, 0.75], [0.22, 0.38, 0.54],
      ] as RGB[];
      const craterColors = [[0.64, 0.72, 0.85], [0.32, 0.40, 0.53]] as RGB[];
      return [
        { shader: "terrain", colors: toRGBA(iceColors),    riverCutoff: 0.42, timeScale: makeTimeScale(size, templates[0]!) },
        { shader: "craters", colors: toRGBA(craterColors),                    timeScale: makeTimeScale(size, templates[1]!) },
      ];
    }
    case "eclipse": {
      const rockColors  = [[0.05, 0.045, 0.055], [0.03, 0.026, 0.03], [0.015, 0.012, 0.016]] as RGB[];
      const glowColors  = [[1.0, 0.85, 0.5], [1.0, 0.42, 0.12], [0.56, 0.10, 0.03]] as RGB[];
      const emberColors = [[1.0, 0.9, 0.6], [1.0, 0.5, 0.15], [0.85, 0.25, 0.06]] as RGB[];
      return [
        { shader: "rock",           colors: toRGBA(rockColors),  timeScale: makeTimeScale(size, templates[0]!) },
        { shader: "eclipse-corona", colors: toRGBA(glowColors),  timeScale: makeTimeScale(size, templates[1]!) },
        { shader: "embers",         colors: toRGBA(emberColors), timeScale: makeTimeScale(size, templates[2]!) },
      ];
    }
    case "comet": {
      const rockColors  = [[0.20, 0.16, 0.14], [0.13, 0.10, 0.09], [0.07, 0.05, 0.05]] as RGB[];
      const lavaColors  = [[1.0, 0.72, 0.28], [0.95, 0.40, 0.10], [0.62, 0.14, 0.04]] as RGB[];
      const tailColors  = [[1.0, 0.92, 0.62], [1.0, 0.52, 0.14], [0.72, 0.14, 0.04]] as RGB[];
      const emberColors = [[1.0, 0.9, 0.6], [1.0, 0.5, 0.15], [0.85, 0.25, 0.06]] as RGB[];
      return [
        { shader: "comet-tail",  colors: toRGBA(tailColors),  timeScale: makeTimeScale(size, templates[0]!) },
        { shader: "rock",        colors: toRGBA(rockColors),  timeScale: makeTimeScale(size, templates[1]!) },
        { shader: "lava-rivers", colors: toRGBA(lavaColors),  riverCutoff: 0.5, timeScale: makeTimeScale(size, templates[2]!) },
        { shader: "embers",      colors: toRGBA(emberColors), timeScale: makeTimeScale(size, templates[3]!) },
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
    if (SHADED_TYPES.has(type)) layers.push(shadeLayer());
    // pixels: 1000 (not 50) so this last-resort path still renders crisp rather
    // than the blocky low-res placeholder. The domain layer now always supplies
    // a real config (see defaultPlanetForId), so this branch should rarely fire.
    return { type, layers, seed, rotation, pixels: 1000, size, octaves, dither: true, canvasScale: CANVAS_SCALE[type] ?? 1, discShrink: DISC_SHRINK[type] ?? 0.7 };
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

  const paramDefs = PLANET_PARAM_DEFS[type] ?? [];
  const overrideFor = (i: number, field: PlanetParamDef["field"]): number | undefined => {
    const def = paramDefs.find((d) => d.layer === i && d.field === field);
    const raw = def && config.params?.[def.key];
    return def && raw !== undefined ? resolveParamField(def, raw) : undefined;
  };

  const layers: PlanetLayer[] = templates.map((tmpl, i) => {
    const paletteColors = (config.customPalette?.[i] ?? palette.layers[i] ?? palette.layers[0]!) as RGB[];

    let cloudCover = tmpl.cloudCover;
    const cloudOverride = overrideFor(i, "cloudCover");
    if (cloudOverride !== undefined) {
      cloudCover = cloudOverride;
    } else if (tmpl.shader === "gas" && cloudCover !== undefined && cloudCover > 0) {
      // Vary cloud coverage slightly per seed so clouds look different on each planet
      cloudCover = cloudCover + (seedRng() * 0.1 - 0.05);
    }

    // Glow: an explicit slider value wins (clamped to GLOW_MAX); otherwise it is
    // randomized per seed in [0, GLOW_MAX] on generation. Never exceeds GLOW_MAX.
    let glow = tmpl.glow;
    const glowOverride = overrideFor(i, "glow");
    if (glowOverride !== undefined) {
      glow = Math.min(glowOverride, GLOW_MAX);
    } else if (glow !== undefined) {
      glow = seedRng() * GLOW_MAX;
    }

    return {
      shader: tmpl.shader,
      colors: toRGBA(paletteColors),
      cloudCover,
      riverCutoff: overrideFor(i, "riverCutoff") ?? tmpl.riverCutoff,
      landCutoff:  overrideFor(i, "landCutoff")  ?? tmpl.landCutoff,
      glow,
      timeScale: makeTimeScale(size, tmpl),
    };
  });

  if (SHADED_TYPES.has(type)) layers.push(shadeLayer());

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
    discShrink: DISC_SHRINK[type] ?? 0.7,
  };
}

// Avoid importing PlanetConfig from types to keep this file self-contained
import type { PlanetConfig } from "./types";
