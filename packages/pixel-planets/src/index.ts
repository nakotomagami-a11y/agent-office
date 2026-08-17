/**
 * @agent-office/pixel-planets — public API.
 *
 * Core usage (framework-agnostic):
 *
 *   import {
 *     getPlanetParams,
 *     PLANET_TYPE_DEFS,
 *     FREEFORM_TYPES,
 *     randomPlanet,
 *     PlanetRenderer,
 *   } from "@agent-office/pixel-planets";
 *
 *   const params  = getPlanetParams("my-project-id", { type: "terran", seed: 42, paletteIdx: 0 });
 *   const renderer = new PlanetRenderer();
 *   renderer.register("my-key", { id: "my-project-id", params, destCanvas, destCtx, size: 64 });
 *
 * React users can import the ready-made component:
 *
 *   import { PlanetCanvas } from "@agent-office/pixel-planets/react";
 *   // (Add "use client" in your own wrapper for Next.js / RSC environments)
 *
 * Types only (zero runtime cost):
 *
 *   import type { PlanetType, PlanetConfig } from "@agent-office/pixel-planets";
 */

// Types (no browser APIs — safe to import anywhere including SSR)

export type {
  PlanetType,
  PlanetConfig,
  PlanetParams,
  PlanetLayer,
  PlanetParamDef,
  ShaderName,
} from "./types";

// Palettes — hand-crafted color schemes per planet type

export { PLANET_TYPE_DEFS } from "./palettes/index";
export type { PlanetTypeDef, PaletteDef } from "./palettes/index";

// Parameters — converts a serialisable PlanetConfig into GPU-ready PlanetParams

export { getPlanetParams, LAYER_TEMPLATES, PLANET_PARAM_DEFS, FREEFORM_TYPES, CANVAS_SCALE } from "./params";

// Random helpers — for "Randomize" buttons and first-run planet generation

export { randomPlanet, randomPlanetOfType } from "./random";

// Renderer — singleton WebGL2 planet renderer class

export { PlanetRenderer } from "./renderer/index";
