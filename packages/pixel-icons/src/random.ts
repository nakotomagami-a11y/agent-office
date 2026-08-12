/**
 * Random config helpers for "reroll" buttons. Uses `Math.random()` — not
 * seeded. For deterministic generation, construct an {@link IconConfig} with a
 * stable seed string yourself.
 */
import type { IconClass, IconClassSelector, IconConfig } from "./types";
import { createRandomSeed } from "./rng";

/** Random config with the given selector (default "anyweapon"). */
export function randomIcon(iconClass: IconClassSelector = "anyweapon"): IconConfig {
  return { seed: createRandomSeed(), iconClass };
}

/** Random config pinned to one concrete class. */
export function randomIconOfClass(iconClass: IconClass): IconConfig {
  return { seed: createRandomSeed(), iconClass };
}
