/**
 * Shared types for palette definitions.
 * Kept in a separate file so each planet module can import without circular deps.
 */
import type { RGB } from "../math";

/**
 * One named color palette for a planet type.
 *
 * `layers` is a parallel array to the type's LAYER_TEMPLATES — element [i]
 * contains the RGB colors for layer [i]. Each inner array is passed to the
 * shader as `colors[]` and its length must match what the shader declares.
 */
export interface PaletteDef {
  name: string;
  layers: RGB[][];
}

/**
 * All metadata + palettes for one planet type.
 * Consumed by the editor UI and the parameter builder.
 */
export interface PlanetTypeDef {
  label: string;
  palettes: PaletteDef[];
}
