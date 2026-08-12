/**
 * Core types for pixel-icons.
 */

/** RGB(A) color, channels 0–255, alpha 0–1. */
export interface Color {
  r: number;
  g: number;
  b: number;
  a?: number;
}

/**
 * A concrete icon category. Each maps to a distinct procedural generator.
 * All are weapons.
 */
export type IconClass = "blades" | "spears" | "axes" | "staffs" | "tridents";

/**
 * What to generate. In addition to the concrete classes, two meta-values
 * resolve to a concrete class deterministically from the seed. Both currently
 * pick from the weapon set (`blades | spears`); `any` and `anyweapon` are kept
 * as distinct names for API stability.
 */
export type IconClassSelector = IconClass | "any" | "anyweapon";

/**
 * Serialisable icon configuration. Safe to store in JSON / YAML / a database.
 * The same `seed` + `iconClass` always produce the same icon on every device.
 */
export interface IconConfig {
  /** String seed. Drives every procedural choice. */
  seed: string;
  /** Which generator to run, or a meta-selector resolved from the seed. */
  iconClass: IconClassSelector;
}
