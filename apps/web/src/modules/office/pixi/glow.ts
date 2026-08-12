// Agent hover / search glow: a blurred silhouette recoloured via ColorMatrix
// (RGB from the offset column, alpha preserved), drawn behind the real sprite;
// BlurFilter spreads it into a halo. Amber = hover, red = search match.
import { AnimatedSprite, BlurFilter, ColorMatrixFilter, Sprite } from "pixi.js";

export const GLOW_AMBER: [number, number, number] = [251 / 255, 191 / 255, 36 / 255]; // #fbbf24
export const GLOW_RED: [number, number, number] = [1, 0.14, 0.1]; // bright red

export function setGlowColor(cm: ColorMatrixFilter, [r, g, b]: [number, number, number]): void {
  cm.matrix = [
    0, 0, 0, 0, r,
    0, 0, 0, 0, g,
    0, 0, 0, 0, b,
    0, 0, 0, 1, 0,
  ];
}

export function makeGlow(): { cm: ColorMatrixFilter; filters: (ColorMatrixFilter | BlurFilter)[] } {
  const cm = new ColorMatrixFilter();
  setGlowColor(cm, GLOW_AMBER);
  // Low strength + tight quality keeps the halo hugging the silhouette so it
  // doesn't pool below the feet (which reads as the agent sinking downward).
  return { cm, filters: [cm, new BlurFilter({ strength: 3, quality: 2 })] };
}

// Props stashed on each agent container so the glow ticker can toggle
// visibility/colour, keep the texture synced, and match against search.
export type AgentContainerExtras = {
  __glow?: Sprite;
  __main?: AnimatedSprite;
  __cm?: ColorMatrixFilter;
  __name?: string;
};
