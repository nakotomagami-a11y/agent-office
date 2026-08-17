/**
 * Core types for pixel-planets.
 *
 * These are the only types you need to store and pass around. Everything else
 * (PlanetParams, PlanetLayer, shader strings) is derived at render time.
 */

// Public serialisable config

/**
 * All supported planet types. Each maps to a distinct shader set and palette
 * family. The renderer dispatches on this value to pick the right programs.
 *
 * Types that don't clip to a circle ("freeform") render outside the sphere
 * boundary by design:
 *   - asteroid  – irregular rocky mass
 *   - galaxy    – tilted spiral disc
 *   - star      – corona blobs and flares extend well outside the body
 *
 * The black hole uses a 3× oversize canvas so the accretion ring has room.
 * The star uses a 2× canvas so the flares don't get clipped.
 */
export type PlanetType =
  | "gas-giant"
  | "rocky"
  | "terran"
  | "ringed-terran"
  | "toxic"
  | "ice"
  | "islands"
  | "lava"
  | "ice-moon"
  | "eclipse"
  | "black-hole"
  | "galaxy"
  | "star"
  | "asteroid"
  | "comet";

/**
 * Serialisable planet configuration. Safe to store in JSON / YAML / a database.
 * The same config always produces the same visual output (fully deterministic).
 */
export interface PlanetConfig {
  type: PlanetType;

  /**
   * Integer seed (1–999 999 999).
   * Drives the mulberry32 PRNG used for all procedural choices (colors,
   * rotation, noise offsets). Same seed = same planet on every device.
   */
  seed: number;

  /** Index into the type's named palette array (clamped if out of range). */
  paletteIdx: number;

  /**
   * Logical pixel density — controls how large each blocky pixel is relative
   * to the canvas. Range: 10 (very chunky) to 120 (fine). Default: 50.
   *
   * Internally each shader does `floor(UV * pixels) / pixels` to quantise
   * the UV before sampling noise, which creates the pixelated look.
   */
  pixels?: number;

  /**
   * Planet rotation in radians (0–2π).
   * When omitted, a rotation is derived deterministically from the seed so
   * the same planet always faces the same direction.
   */
  rotation?: number;

  /**
   * Whether to apply Bayer-style ordered dithering at light/shadow borders.
   * Creates the characteristic chunky colour stepping. Defaults to true.
   */
  dither?: boolean;

  /**
   * Per-layer color overrides. When present, these replace the colors from the
   * named palette (`paletteIdx`). Structure mirrors `PaletteDef.layers`:
   * `customPalette[layerIndex][colorIndex]` is an RGB triple (values 0–1).
   *
   * Set by the editor when the user adjusts individual swatch colors. Storing it
   * on the config keeps saves fully self-contained — no reference to the preset
   * palette needed at render time.
   */
  customPalette?: [number, number, number][][];

  /**
   * Per-type tunable parameters, keyed by `PlanetParamDef.key`. Values are in
   * the intuitive "more of the named thing" units the editor slider shows —
   * `getPlanetParams` applies each `PlanetParamDef` (including its `invert`
   * flag) to translate them into the underlying shader field. Unknown keys are
   * ignored, so switching type and back never corrupts the render.
   */
  params?: Record<string, number>;
}

/**
 * Describes one adjustable knob for a planet type (rendered as a slider).
 *
 * Each def maps onto a single field of one layer template. `min`/`max`/`default`
 * are expressed in intuitive units (higher = more of the thing the label names).
 * When `invert` is set the stored slider value `v` is translated to the shader
 * field as `(min + max) - v` — needed because several shader cutoffs run
 * backwards (e.g. a higher `cloudCover` means *fewer* clouds).
 */
export interface PlanetParamDef {
  key: string;
  label: string;
  /** Index into the type's LAYER_TEMPLATES array. */
  layer: number;
  /** Which numeric field of that layer this knob drives. */
  field: "cloudCover" | "riverCutoff" | "landCutoff" | "glow";
  min: number;
  max: number;
  step: number;
  /** Slider default, in intuitive units. */
  default: number;
  /** Reverse slider direction relative to the raw shader field. */
  invert?: boolean;
  /**
   * Denominator for the editor's % readout (default `max`). Lets the slider cap
   * at `max` while displaying an absolute percentage — e.g. glow caps at
   * max 0.56 but with displayMax 1.0 the readout tops out at 56%, not 100%.
   */
  displayMax?: number;
}

// Internal render types (derived from PlanetConfig by getPlanetParams)

/**
 * GLSL fragment shader names. Each string is a key in the SHADERS map and
 * corresponds to exactly one `.ts` file under `renderer/shaders/`.
 */
export type ShaderName =
  | "gas"            // gas-giant cloud bands
  | "gas-ring"       // Saturn-style tilted ring (composited over gas layers)
  | "rock"           // rocky surface with dithered shadows
  | "craters"        // crater overlay (composited over rock)
  | "terrain"        // land masses with optional river channels
  | "landmass"       // island landmass overlay (partially transparent)
  | "lava-rivers"    // glowing lava channels (transparent except at cracks)
  | "asteroid"       // irregular freeform rocky mass (no sphere clip)
  | "black-hole-body"// dark sphere with a thin glowing rim
  | "black-hole-ring"// accretion disk (composited over the body)
  | "galaxy"         // tilted spiral disc (freeform)
  | "star-blobs"     // blob corona around the star body (freeform)
  | "star-main"      // Voronoi-cell star surface
  | "star-flares"    // spiky solar flares (freeform)
  | "atmo-glow"      // atmospheric corona hugging the planet edge (freeform)
  | "eclipse-corona" // eclipse ring of fire + streamers + diamond bead (freeform)
  | "atmo-ring"      // transparent, fbm-distorted tilted ring (freeform)
  | "embers"         // floating spark particles around the planet (freeform)
  | "debris"         // scattered rock chunks orbiting the planet (freeform)
  | "comet-tail"     // directional fiery trail streaming off the planet (freeform)
  | "explosions"     // bright eruption flashes blooming across a molten surface
  | "ejecta"         // fiery eruption plumes flung outward off a molten rim
  | "fracture"       // impact-shattered plates with glowing molten fissures
  | "shade";         // spherical terminator + limb darkening overlay (depth)

/**
 * A single compositing layer ready to upload to the GPU.
 * Planets are built from 1–3 layers drawn back-to-front via alpha blending.
 */
export interface PlanetLayer {
  shader: ShaderName;

  /**
   * Flat RGBA float array: [r₀,g₀,b₀,a₀, r₁,g₁,b₁,a₁, …] (all values 0–1).
   * Alpha is always 1.0 for solid palette colors.
   * Array length = 4 × (number of colors the shader declares).
   */
  colors: number[];

  /** gas shader: fbm threshold below which the pixel becomes transparent. */
  cloudCover?: number;

  /**
   * terrain / lava-rivers: fbm threshold that determines where rivers/water
   * appear. Higher values = less water. 0 = completely dry.
   */
  riverCutoff?: number;

  /**
   * landmass: fbm threshold above which pixels show as land (rest is transparent
   * ocean that the layer below shows through).
   */
  landCutoff?: number;

  /**
   * atmo-glow / atmo-ring: intensity/opacity multiplier (default 1.0). Exposed
   * as the "Glow" slider on toxic-style types.
   */
  glow?: number;

  /**
   * Multiplied against global elapsed seconds before being passed to the
   * shader as the `time` uniform. Controls animation speed.
   * Set to 0 for static layers (e.g. asteroid — seeds are position-based).
   */
  timeScale: number;
}

/**
 * Fully resolved render parameters consumed directly by the WebGL renderer.
 * Produced by `getPlanetParams()`.
 */
export interface PlanetParams {
  type: PlanetType;
  layers: PlanetLayer[];

  /** Float GLSL seed derived from the integer seed (seed % 1000 / 100). */
  seed: number;

  rotation: number;
  pixels: number;

  /**
   * FBM domain scale — passed as the `size` uniform. Most shaders use 9.0
   * which gives a good noise frequency. Specialised types override per-layer
   * (e.g. asteroid 5.3, galaxy 7.0, star blobs 4.93, ring 6.6).
   */
  size: number;

  /** Default FBM octave count. Most types use 5; specialised types override. */
  octaves: number;

  dither: boolean;

  /**
   * Render canvas multiplier. The offscreen GL canvas is rendered at
   * `displaySize × canvasScale` and then downscaled to `displaySize`.
   *
   * Why: the star corona blobs and black hole ring extend outside the planet
   * disc. Without extra canvas space they'd be clipped at the edge.
   *
   * - 1 × — default (all sphere-clipped types)
   * - 2 × — star (blobs + flares overhang by ~50% of the radius)
   * - 3 × — black hole (ring extends to ~1.5 × the disc radius)
   */
  canvasScale: number;

  /**
   * Disc shrink factor for terrain/gas/gas-ring layers on an oversized canvas
   * (canvasScale > 1). The planet disc radius is `(1/(canvasScale*2)) * discShrink`.
   *
   * - 0.7 — gas-giant / ringed-terran: shrink the body to leave room for a wide
   *         Saturn-style ring far outside it.
   * - 1.0+ — toxic: keep the body near full size so a close-hugging corona/ring
   *          sits right against the surface (the "slightly bigger planet" look).
   *
   * Ignored at canvasScale = 1 (disc always fills the canvas there).
   */
  discShrink: number;
}
