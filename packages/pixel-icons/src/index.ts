/**
 * pixel-icons — procedural pixel-art weapon icon generator.
 *
 * TypeScript port of Icon Machine by Brian MacIntosh (GPL-3.0).
 * See README for attribution and licensing.
 */
export type { Color, IconClass, IconClassSelector, IconConfig } from "./types";
export { IconGenerator, generateIcon, type Ctx2D } from "./generator";
export { randomIcon, randomIconOfClass } from "./random";
export { createRandomSeed } from "./rng";
export { Vector, Bounds } from "./math";
export { PARTICLE_TYPES, pickParticleType, type ParticleType } from "./particles";
