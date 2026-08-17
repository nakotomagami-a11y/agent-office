/**
 * WebGL2 planet renderer.
 *
 * Architecture — singleton offscreen canvas:
 *   One offscreen <canvas> holds a single WebGL2 context. All WebGL programs
 *   are compiled once at init. On every rAF tick, the renderer iterates over
 *   all registered display canvases, renders each planet to the offscreen
 *   canvas at the right size, then copies the result with drawImage().
 *
 * Why a singleton: WebGL contexts are expensive OS resources. Browsers cap
 *   the number per page (typically 8–16). With many planet canvases on screen,
 *   creating one context per canvas would hit that limit and silently fail.
 *   The singleton approach uses exactly one context no matter how many planets
 *   are displayed simultaneously.
 *
 * Why premultipliedAlpha: false:
 *   Our fragment shaders write non-premultiplied RGBA (alpha=0 where
 *   transparent, non-zero RGB). With premultipliedAlpha: true (the default),
 *   some browsers treat (rgb, alpha=0) as an invalid premultiplied value and
 *   composite it as opaque white. Setting premultipliedAlpha: false tells the
 *   browser to treat our outputs as straight-alpha, which correctly makes
 *   alpha=0 pixels transparent regardless of the RGB values.
 */

import type { PlanetParams, PlanetLayer, ShaderName, PlanetType } from "../types";
import { VERT_SRC, FRAG_SHADERS }  from "./shaders/index";
import { setUniform, setUniformInt } from "./uniforms";

// Shader compilation helpers

function compileShader(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader {
  const s = gl.createShader(type)!;
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(s);
    gl.deleteShader(s);
    throw new Error(`Shader compile error:\n${log}`);
  }
  return s;
}

function linkProgram(gl: WebGL2RenderingContext, vertSrc: string, fragSrc: string): WebGLProgram {
  const vert = compileShader(gl, gl.VERTEX_SHADER, vertSrc);
  const frag = compileShader(gl, gl.FRAGMENT_SHADER, fragSrc);
  const prog = gl.createProgram()!;
  gl.attachShader(prog, vert);
  gl.attachShader(prog, frag);
  gl.linkProgram(prog);
  gl.deleteShader(vert);
  gl.deleteShader(frag);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(prog);
    gl.deleteProgram(prog);
    throw new Error(`Program link error: ${log}`);
  }
  return prog;
}

// Full-screen quad: two triangles covering the NDC [-1,1]² viewport.
// Interleaved layout: [x, y, u, v] × 4 vertices.
const QUAD_VERTS = new Float32Array([-1,-1,0,0, 1,-1,1,0, -1,1,0,1, 1,1,1,1]);
const QUAD_IDX   = new Uint16Array([0,1,2, 1,3,2]);

// Per-layer uniform upload

/**
 * Upload all uniforms for one planet layer and issue the draw call.
 * Common uniforms (pixels, rotation, seed, time, colors) are always uploaded.
 * Shader-specific uniforms are handled in the switch below.
 */
function drawLayer(
  gl: WebGL2RenderingContext,
  prog: WebGLProgram,
  layer: PlanetLayer,
  params: PlanetParams,
  time: number,
  canvasScale: number,
): void {
  gl.useProgram(prog);

  const t = time * layer.timeScale;
  const shouldDither = params.dither ? 1 : 0;

  // Uniforms common to (almost) all shaders
  setUniform(gl, prog, "pixels",      params.pixels);
  setUniform(gl, prog, "rotation",    params.rotation);
  setUniform(gl, prog, "light_origin",[0.39, 0.39]);
  setUniform(gl, prog, "size",        params.size);
  setUniformInt(gl, prog, "OCTAVES",  params.octaves);
  setUniform(gl, prog, "seed",        params.seed);
  setUniform(gl, prog, "time",        t);
  setUniform(gl, prog, "colors",      layer.colors);

  // Shader-specific uniforms
  switch (layer.shader) {
    case "gas": {
      // For gas-giant (canvasScale>1) the 0.7 factor shrinks the disc to leave
      // a visible gap for the ring. For cloud layers on terran/ice/islands
      // (canvasScale=1) the disc must fill the whole canvas so clouds align
      // with the terrain disc (identity: uvOff=0, uvScale=1).
      const planetR  = canvasScale > 1
        ? (1 / (canvasScale * 2)) * (params.discShrink ?? 0.7)
        : 0.5;
      const uvOff    = 0.5 - planetR;
      const uvScale  = 1 / (2 * planetR);
      setUniform(gl, prog, "pixels",        params.pixels * uvScale);
      setUniform(gl, prog, "uv_offset",     uvOff);
      setUniform(gl, prog, "uv_scale",      uvScale);
      setUniform(gl, prog, "cloud_cover",   layer.cloudCover ?? 0);
      setUniform(gl, prog, "time_speed",    0.7);
      setUniform(gl, prog, "stretch",       2.5);
      setUniform(gl, prog, "cloud_curve",   1.3);
      setUniform(gl, prog, "light_border_1",0.52);
      setUniform(gl, prog, "light_border_2",0.62);
      break;
    }

    case "gas-ring": {
      // scale_rel_to_planet = 1/planetR so the disc-exclusion circle in the
      // ring shader's upper-half mask exactly matches the (shrunk) planet disc.
      const planetR = (1 / (canvasScale * 2)) * (params.discShrink ?? 0.7);
      // Toxic's ring hugs close to a near-full-size disc: wider band, flatter
      // tilt. Gas-giant/ringed-terran keep the classic far Saturn ring.
      const isClose = (params.discShrink ?? 0.7) >= 0.95;
      setUniform(gl, prog, "pixels",               params.pixels * canvasScale);
      setUniform(gl, prog, "size",                 6.0);
      setUniform(gl, prog, "time_speed",           0.2);
      setUniform(gl, prog, "ring_width",           isClose ? 0.16 : 0.1);
      setUniform(gl, prog, "ring_perspective",     isClose ? 3.0 : 4.0);
      setUniform(gl, prog, "scale_rel_to_planet",  1 / planetR);
      setUniformInt(gl, prog, "OCTAVES",           3);
      break;
    }

    case "atmo-glow": {
      // Corona works in full-canvas UV (center 0.5); planet_r is the disc radius
      // in canvas UV. The glow spreads ~55% of the radius beyond the edge.
      const planetR = canvasScale > 1 ? (1 / (canvasScale * 2)) * (params.discShrink ?? 0.7) : 0.5;
      // Eclipse wants a thin, tight "ring of fire" hugging the black body;
      // toxic wants a broader soft corona.
      const glowWidth = params.type === "eclipse" ? planetR * 0.26 : planetR * 0.55;
      setUniform(gl, prog, "pixels",       params.pixels * canvasScale);
      setUniform(gl, prog, "planet_r",     planetR);
      setUniform(gl, prog, "glow_width",   glowWidth);
      setUniform(gl, prog, "glow_strength",layer.glow ?? 1.0);
      setUniform(gl, prog, "time_speed",   0.15);
      setUniform(gl, prog, "size",         8.0);
      setUniformInt(gl, prog, "OCTAVES",   4);
      break;
    }

    case "eclipse-corona": {
      // Corona lives around a near-full-size dark body; give the streamers plenty
      // of room to fan out into the oversized canvas.
      const planetR = canvasScale > 1 ? (1 / (canvasScale * 2)) * (params.discShrink ?? 0.7) : 0.5;
      setUniform(gl, prog, "pixels",       params.pixels * canvasScale);
      setUniform(gl, prog, "planet_r",     planetR);
      setUniform(gl, prog, "glow_width",   planetR * 0.9);
      setUniform(gl, prog, "glow_strength",layer.glow ?? 1.0);
      setUniform(gl, prog, "time_speed",   0.15);
      setUniform(gl, prog, "size",         8.0);
      setUniformInt(gl, prog, "OCTAVES",   4);
      break;
    }

    case "atmo-ring": {
      // Transparent, fbm-distorted haze ring hugging a near-full-size disc.
      const planetR = (1 / (canvasScale * 2)) * (params.discShrink ?? 0.7);
      setUniform(gl, prog, "pixels",              params.pixels * canvasScale);
      setUniform(gl, prog, "time_speed",          0.15);
      setUniform(gl, prog, "ring_width",          0.17);
      setUniform(gl, prog, "ring_perspective",    3.0);
      setUniform(gl, prog, "scale_rel_to_planet", 1 / planetR);
      setUniform(gl, prog, "ring_opacity",        0.6);
      setUniform(gl, prog, "size",                5.0);
      setUniformInt(gl, prog, "OCTAVES",          3);
      break;
    }

    case "embers": {
      // Sparks live in a band from the silhouette out to ember_reach beyond it.
      const planetR = canvasScale > 1 ? (1 / (canvasScale * 2)) * (params.discShrink ?? 0.7) : 0.5;
      setUniform(gl, prog, "pixels",      params.pixels * canvasScale);
      setUniform(gl, prog, "planet_r",    planetR);
      setUniform(gl, prog, "ember_reach", planetR * 0.7);
      setUniform(gl, prog, "density",     0.14);
      setUniform(gl, prog, "grid",        34.0);
      setUniform(gl, prog, "time_speed",  1.6);
      break;
    }

    case "debris": {
      // Rock chunks scattered in the annulus around the (shrunk) planet disc.
      const planetR = canvasScale > 1 ? (1 / (canvasScale * 2)) * (params.discShrink ?? 0.7) : 0.5;
      setUniform(gl, prog, "pixels",   params.pixels * canvasScale);
      setUniform(gl, prog, "planet_r", planetR);
      setUniform(gl, prog, "field_r",  planetR + planetR * 0.95);
      setUniform(gl, prog, "density",  16.0);
      break;
    }

    case "comet-tail": {
      // Fiery trail streaming off the head; drawn first (behind the molten body).
      const planetR = canvasScale > 1 ? (1 / (canvasScale * 2)) * (params.discShrink ?? 0.7) : 0.5;
      setUniform(gl, prog, "pixels",      params.pixels * canvasScale);
      setUniform(gl, prog, "planet_r",    planetR);
      setUniform(gl, prog, "tail_len",    0.46);
      setUniform(gl, prog, "tail_spread", 0.52);
      setUniform(gl, prog, "time_speed",  0.6);
      setUniform(gl, prog, "size",        7.0);
      setUniformInt(gl, prog, "OCTAVES",  4);
      break;
    }

    case "rock": {
      const planetR = canvasScale > 1 ? (1 / (canvasScale * 2)) * (params.discShrink ?? 0.7) : 0.5;
      const uvScale = 1 / (2 * planetR);
      setUniform(gl, prog, "pixels",        params.pixels * uvScale);
      setUniform(gl, prog, "uv_offset",     0.5 - planetR);
      setUniform(gl, prog, "uv_scale",      uvScale);
      setUniform(gl, prog, "time_speed",    0.2);
      setUniform(gl, prog, "dither_size",   2.0);
      setUniform(gl, prog, "light_border_1",0.4);
      setUniform(gl, prog, "light_border_2",0.6);
      setUniformInt(gl, prog, "should_dither", shouldDither);
      break;
    }

    case "craters": {
      const planetR = canvasScale > 1 ? (1 / (canvasScale * 2)) * (params.discShrink ?? 0.7) : 0.5;
      const uvScale = 1 / (2 * planetR);
      setUniform(gl, prog, "pixels",      params.pixels * uvScale);
      setUniform(gl, prog, "uv_offset",   0.5 - planetR);
      setUniform(gl, prog, "uv_scale",    uvScale);
      setUniform(gl, prog, "time_speed",  0.001);
      setUniform(gl, prog, "light_border",0.4);
      break;
    }

    case "terrain": {
      // Same disc-shrink as the gas layer so a ring (ringed-terran) has room and
      // aligns. canvasScale=1 → planetR=0.5 → uvOff=0, uvScale=1 (identity, so
      // every existing terrain planet renders exactly as before).
      const planetR = canvasScale > 1 ? (1 / (canvasScale * 2)) * (params.discShrink ?? 0.7) : 0.5;
      const uvOff   = 0.5 - planetR;
      const uvScale = 1 / (2 * planetR);
      setUniform(gl, prog, "pixels",        params.pixels * uvScale);
      setUniform(gl, prog, "uv_offset",     uvOff);
      setUniform(gl, prog, "uv_scale",      uvScale);
      setUniform(gl, prog, "time_speed",    0.2);
      setUniform(gl, prog, "dither_size",   3.95);
      setUniform(gl, prog, "light_border_1",0.287);
      setUniform(gl, prog, "light_border_2",0.476);
      setUniform(gl, prog, "river_cutoff",  layer.riverCutoff ?? 0.0);
      setUniformInt(gl, prog, "should_dither", shouldDither);
      break;
    }

    case "landmass":
      setUniform(gl, prog, "time_speed",    0.1);
      setUniform(gl, prog, "dither_size",   2.0);
      setUniform(gl, prog, "light_border_1",0.32);
      setUniform(gl, prog, "light_border_2",0.534);
      setUniform(gl, prog, "land_cutoff",   layer.landCutoff ?? 0.5);
      setUniformInt(gl, prog, "should_dither", shouldDither);
      break;

    case "lava-rivers": {
      const planetR = canvasScale > 1 ? (1 / (canvasScale * 2)) * (params.discShrink ?? 0.7) : 0.5;
      const uvScale = 1 / (2 * planetR);
      setUniform(gl, prog, "pixels",        params.pixels * uvScale);
      setUniform(gl, prog, "uv_offset",     0.5 - planetR);
      setUniform(gl, prog, "uv_scale",      uvScale);
      setUniform(gl, prog, "time_speed",    0.2);
      setUniform(gl, prog, "light_border_1",0.019);
      setUniform(gl, prog, "light_border_2",0.036);
      setUniform(gl, prog, "river_cutoff",  layer.riverCutoff ?? 0.58);
      break;
    }

    case "shade": {
      // Spherical depth overlay over the body disc. Same remap as the surface
      // layers so it lines up with the (possibly shrunk) sphere.
      const planetR = canvasScale > 1 ? (1 / (canvasScale * 2)) * (params.discShrink ?? 0.7) : 0.5;
      const uvScale = 1 / (2 * planetR);
      setUniform(gl, prog, "pixels",        params.pixels * uvScale);
      setUniform(gl, prog, "uv_offset",     0.5 - planetR);
      setUniform(gl, prog, "uv_scale",      uvScale);
      setUniform(gl, prog, "shade_strength", 0.4);
      break;
    }

    case "fracture": {
      // Impact-shattered plates. Same disc remap as rock/craters so the cracks
      // sit on the (shrunk) sphere. `impact` is the "Impact Damage" slider,
      // carried on the layer's riverCutoff field (0..1).
      const planetR = canvasScale > 1 ? (1 / (canvasScale * 2)) * (params.discShrink ?? 0.7) : 0.5;
      const uvScale = 1 / (2 * planetR);
      setUniform(gl, prog, "pixels",     params.pixels * uvScale);
      setUniform(gl, prog, "uv_offset",  0.5 - planetR);
      setUniform(gl, prog, "uv_scale",   uvScale);
      setUniform(gl, prog, "impact",     layer.riverCutoff ?? 0.5);
      setUniform(gl, prog, "size",       7.0);
      setUniformInt(gl, prog, "OCTAVES", 4);
      setUniformInt(gl, prog, "should_dither", shouldDither);
      break;
    }

    case "explosions": {
      // Turbulent eruption fireballs on the molten surface. Same disc remap as
      // rock/lava-rivers so eruptions stay on the (shrunk) sphere when lava
      // renders on a 2× canvas. canvasScale=1 → identity (uvOff=0, uvScale=1).
      const planetR = canvasScale > 1 ? (1 / (canvasScale * 2)) * (params.discShrink ?? 0.7) : 0.5;
      const uvScale = 1 / (2 * planetR);
      setUniform(gl, prog, "pixels",     params.pixels * uvScale);
      setUniform(gl, prog, "uv_offset",  0.5 - planetR);
      setUniform(gl, prog, "uv_scale",   uvScale);
      setUniform(gl, prog, "time_speed", 0.5);
      setUniform(gl, prog, "grid",       9.0);
      setUniform(gl, prog, "size",       9.0);
      setUniformInt(gl, prog, "OCTAVES", 4);
      setUniformInt(gl, prog, "should_dither", shouldDither);
      break;
    }

    case "ejecta": {
      // Eruption plumes flung off the rim; live in a band from the silhouette
      // out to `reach` beyond it. Full-canvas UV on the oversized lava canvas.
      const planetR = canvasScale > 1 ? (1 / (canvasScale * 2)) * (params.discShrink ?? 0.7) : 0.5;
      setUniform(gl, prog, "pixels",     params.pixels * canvasScale);
      setUniform(gl, prog, "planet_r",   planetR);
      setUniform(gl, prog, "reach",      planetR * 0.55);
      setUniform(gl, prog, "sectors",    18.0);
      setUniform(gl, prog, "time_speed", 0.6);
      setUniform(gl, prog, "size",       9.0);
      setUniformInt(gl, prog, "OCTAVES", 4);
      setUniformInt(gl, prog, "should_dither", shouldDither);
      break;
    }

    case "asteroid":
      // Original tscn values: size=5.294, OCTAVES=2
      setUniform(gl, prog, "size",    5.3);
      setUniformInt(gl, prog, "OCTAVES", 2);
      setUniformInt(gl, prog, "should_dither", shouldDither);
      break;

    case "black-hole-body": {
      // Map body UV into center 1/canvasScale of the oversized canvas
      const uvOff = (canvasScale - 1) / (2 * canvasScale);
      setUniform(gl, prog, "radius",      0.30);
      setUniform(gl, prog, "light_width", 0.032);
      setUniform(gl, prog, "uv_offset",   uvOff);
      setUniform(gl, prog, "uv_scale",    canvasScale);
      break;
    }

    case "black-hole-ring":
      // Ring fills the full canvas — scale pixels proportionally
      setUniform(gl, prog, "pixels",          params.pixels * canvasScale);
      setUniform(gl, prog, "size",            6.6);
      setUniform(gl, prog, "time_speed",      0.2);
      setUniform(gl, prog, "disk_width",      0.075);
      setUniform(gl, prog, "ring_perspective",10.5);
      setUniformInt(gl, prog, "should_dither",shouldDither);
      setUniformInt(gl, prog, "OCTAVES",      3);
      break;

    case "galaxy":
      setUniform(gl, prog, "size",      7.0);
      setUniform(gl, prog, "time_speed",1.0);
      setUniformInt(gl, prog, "should_dither", shouldDither);
      setUniformInt(gl, prog, "OCTAVES", 1);
      break;

    case "star-blobs":
      // Blobs fill full 2× canvas — scale pixels so chunk density is consistent
      setUniform(gl, prog, "pixels",     params.pixels * canvasScale);
      setUniform(gl, prog, "size",       4.93);
      setUniform(gl, prog, "time_speed", 0.05);
      setUniformInt(gl, prog, "OCTAVES", 4);
      break;

    case "star-main": {
      // Body renders in center 1/canvasScale of the 2× canvas
      const uvOff = (canvasScale - 1) / (2 * canvasScale);
      setUniform(gl, prog, "time_speed",  0.05);
      setUniformInt(gl, prog, "should_dither", shouldDither);
      setUniform(gl, prog, "uv_offset",   uvOff);
      setUniform(gl, prog, "uv_scale",    canvasScale);
      break;
    }

    case "star-flares":
      // Flares fill full 2× canvas
      setUniform(gl, prog, "pixels",     params.pixels * canvasScale);
      setUniform(gl, prog, "size",       1.6);
      setUniform(gl, prog, "time_speed", 0.05);
      setUniformInt(gl, prog, "should_dither", shouldDither);
      setUniformInt(gl, prog, "OCTAVES", 4);
      break;
  }

  // Always use SRC_ALPHA blending. Even for the first layer (where destination
  // is cleared to transparent), this ensures alpha=0 pixels stay transparent.
  // Without blending enabled, shaders that write (rgb, alpha=0) for background
  // pixels produce "invalid" premultiplied values that some browsers display
  // as opaque white. See renderer/index.ts header for full explanation.
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

  gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0);
}

// Registration record

/** One display canvas that the renderer writes to each frame. */
interface Registration {
  id: string;
  params: PlanetParams;
  destCanvas: HTMLCanvasElement;
  destCtx: CanvasRenderingContext2D;
  size: number;
  /**
   * Cached silhouette-outline pixels. Computed once from the first rendered
   * frame (the outer silhouette is static — the base disc is always opaque),
   * then re-stamped over every animated frame. `undefined` = not yet computed.
   */
  outline?: OutlinePix[];
}

/** A single silhouette-edge pixel and whether it faces the top-left light. */
interface OutlinePix {
  x: number;
  y: number;
  lit: boolean;
}

// Tiny-swords outline — matches the weapon icons (`pixel-icons` palette.ts):
// warm near-black `#161c2e` on shadowed (down-right) edges, a lifted navy on
// top-left lit edges. Gives planets the same defined pixel-art rim so they sit
// cohesively next to the weapon sprites instead of floating as soft discs.
const OUTLINE_SHADOW = "rgb(22,28,46)";  // #161c2e
const OUTLINE_LIT    = "rgb(59,64,79)";  // #161c2e lifted 16% toward white

/**
 * Types whose silhouette is a static solid body — safe to trace once and cache.
 * Excludes anything with an animated ring/corona/spiral (gas-giant, black-hole,
 * star, galaxy): those move under a cached outline, leaving a detached "ghost"
 * rim, and a hard outline looks noisy on a glowing ring anyway. Their soft
 * edges also read fine without one.
 */
const OUTLINE_TYPES = new Set<PlanetType>([
  "rocky", "terran", "ice", "islands", "ice-moon", "asteroid",
]);

/**
 * Trace the solid body's outer edge (inner outline — paints the body's own
 * rim pixels, never expands past the canvas). Gated to fully-opaque pixels
 * bordering fully-empty ones, so soft star/galaxy glow gradients — which fade
 * through mid-alpha and never sit opaque-next-to-empty — get no ring.
 */
function computeOutline(ctx: CanvasRenderingContext2D, n: number): OutlinePix[] {
  const d = ctx.getImageData(0, 0, n, n).data;
  const alpha = (x: number, y: number) =>
    x < 0 || y < 0 || x >= n || y >= n ? 0 : d[(x + y * n) * 4 + 3]!;
  const out: OutlinePix[] = [];
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      if (alpha(x, y) < 250) continue; // solid body only
      const up = alpha(x, y - 1) <= 8;
      const dn = alpha(x, y + 1) <= 8;
      const lf = alpha(x - 1, y) <= 8;
      const rt = alpha(x + 1, y) <= 8;
      if (!(up || dn || lf || rt)) continue; // interior pixel
      const litScore = (up ? 1 : 0) + (lf ? 1 : 0) - (dn ? 1 : 0) - (rt ? 1 : 0);
      out.push({ x, y, lit: litScore > 0 });
    }
  }
  return out;
}

// PlanetRenderer

/**
 * Singleton WebGL2 renderer.
 *
 * Usage:
 *   const renderer = new PlanetRenderer();
 *   renderer.register("my-key", { id, params, destCanvas, destCtx, size });
 *   // The renderer starts its own rAF loop automatically.
 *   // When the display element is removed:
 *   renderer.unregister("my-key");
 *
 * The renderer lazily creates its WebGL context on the first register() call
 * so it has no effect in server-side rendering environments.
 */
export class PlanetRenderer {
  private gl: WebGL2RenderingContext | null = null;
  private offscreen: HTMLCanvasElement | null = null;
  private programs = new Map<ShaderName, WebGLProgram>();
  private vao: WebGLVertexArrayObject | null = null;
  private registrations = new Map<string, Registration>();
  private rafId = 0;
  private startTime = performance.now();
  private initialized = false;

  // Initialisation (deferred until first use)

  private init(): boolean {
    if (this.initialized) return this.gl !== null;
    this.initialized = true;

    const canvas = document.createElement("canvas");
    canvas.width = 128;
    canvas.height = 128;
    this.offscreen = canvas;

    const gl = canvas.getContext("webgl2", {
      antialias:          false,
      alpha:              true,
      // premultipliedAlpha: false so (rgb, alpha=0) background pixels are
      // correctly transparent when read by 2D canvas drawImage().
      premultipliedAlpha: false,
      preserveDrawingBuffer: true,
    });
    if (!gl) return false;
    this.gl = gl;

    // Compile each program independently so one bad shader only disables its own
    // layer (the render loop skips layers with no program) instead of blanking
    // every planet on the page.
    for (const [name, fragSrc] of Object.entries(FRAG_SHADERS) as [ShaderName, string][]) {
      try {
        this.programs.set(name, linkProgram(gl, VERT_SRC, fragSrc));
      } catch (e) {
        console.error(`[pixel-planets] Shader "${name}" failed to compile:`, e);
      }
    }
    if (this.programs.size === 0) {
      this.gl = null;
      return false;
    }

    // Single VAO shared across all programs (same vertex layout for all)
    const vao = gl.createVertexArray()!;
    gl.bindVertexArray(vao);

    const vbo = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, QUAD_VERTS, gl.STATIC_DRAW);

    const ibo = gl.createBuffer()!;
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, QUAD_IDX, gl.STATIC_DRAW);

    // Set up vertex attribute pointers for every program
    for (const prog of this.programs.values()) {
      gl.useProgram(prog);
      const posLoc = gl.getAttribLocation(prog, "a_pos");
      const uvLoc  = gl.getAttribLocation(prog, "a_uv");
      if (posLoc >= 0) { gl.enableVertexAttribArray(posLoc); gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 16, 0); }
      if (uvLoc  >= 0) { gl.enableVertexAttribArray(uvLoc);  gl.vertexAttribPointer(uvLoc,  2, gl.FLOAT, false, 16, 8); }
    }

    this.vao = vao;
    return true;
  }

  // Public API

  /**
   * Register a display canvas for continuous rendering.
   * Starts the rAF loop if not already running.
   */
  register(key: string, reg: Registration): void {
    if (!this.init()) return;
    this.registrations.set(key, reg);
    if (this.rafId === 0) this.startLoop();
  }

  /**
   * Unregister a display canvas. Stops the rAF loop when no canvases remain.
   */
  unregister(key: string): void {
    this.registrations.delete(key);
    if (this.registrations.size === 0 && this.rafId !== 0) {
      cancelAnimationFrame(this.rafId);
      this.rafId = 0;
    }
  }

  // Render loop

  private startLoop(): void {
    const loop = () => {
      this.renderAll();
      this.rafId = requestAnimationFrame(loop);
    };
    this.rafId = requestAnimationFrame(loop);
  }

  private renderAll(): void {
    const gl = this.gl;
    if (!gl || !this.offscreen) return;

    const elapsed = (performance.now() - this.startTime) / 1000;

    for (const reg of this.registrations.values()) {
      const { params, destCanvas: _destCanvas, destCtx, size } = reg;
      const canvasScale = params.canvasScale;
      const renderSize  = size * canvasScale;

      // Resize the offscreen canvas to match this planet's render size.
      // Resizing clears the canvas automatically (WebGL spec).
      if (this.offscreen.width !== renderSize || this.offscreen.height !== renderSize) {
        this.offscreen.width  = renderSize;
        this.offscreen.height = renderSize;
      }

      gl.viewport(0, 0, renderSize, renderSize);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.bindVertexArray(this.vao);

      for (const layer of params.layers) {
        const prog = this.programs.get(layer.shader);
        if (!prog) continue;
        drawLayer(gl, prog, layer, params, elapsed, canvasScale);
      }

      // Blit the offscreen render to the display canvas at full renderSize.
      // PlanetCanvas sets the display canvas to renderSize px, so this is a
      // 1:1 pixel copy — no downscaling. The disc occupies the center
      // 1/canvasScale of the result; blobs, flares, and the ring fill the rest.
      destCtx.clearRect(0, 0, renderSize, renderSize);
      destCtx.drawImage(this.offscreen, 0, 0, renderSize, renderSize);

      // Stamp the tiny-swords silhouette outline over the fresh frame. Only for
      // static-body types (OUTLINE_TYPES) — the rim is fixed there, so compute
      // it once and re-apply the cached pixels each frame (a couple hundred
      // fillRects — cheaper than a per-frame readback). Ring/corona types are
      // skipped so a cached rim can't ghost over their animated silhouette.
      if (reg.outline === undefined) {
        reg.outline = OUTLINE_TYPES.has(params.type)
          ? computeOutline(destCtx, renderSize)
          : [];
      }
      const ol = reg.outline;
      if (ol.length) {
        destCtx.fillStyle = OUTLINE_SHADOW;
        for (const p of ol) if (!p.lit) destCtx.fillRect(p.x, p.y, 1, 1);
        destCtx.fillStyle = OUTLINE_LIT;
        for (const p of ol) if (p.lit) destCtx.fillRect(p.x, p.y, 1, 1);
      }
    }
  }
}
