/**
 * Pure cell-builder for the 24x32 pixel agent sprite. Ported from
 * design-source/v3/sprites.jsx - kept in this `.utils.ts` so the React
 * component is a thin SVG renderer with no domain logic.
 */

export type SpriteAccessory = "glasses" | "cap" | "headphones" | "earbuds" | null;

export type SpriteSpec = {
  skin?: string;
  hair?: string;
  shirt?: string;
  accessory?: SpriteAccessory;
};

export type SpriteAgent = {
  sprite?: SpriteSpec;
  status?: string;
};

export type SpriteAction = "idle" | "typing";

export type SpriteCell = {
  x: number;
  y: number;
  w: number;
  h: number;
  fill: string;
};

export const SPRITE_W = 24;
export const SPRITE_H = 32;

/**
 * Lighten/darken a hex colour. `percent` clamped to [-100, 100]; negative shades
 * toward black, positive toward white. Tiny port of the v3 helper - fast enough
 * to call per-render without memoisation.
 */
export function shadeColor(hex: string, percent: number): string {
  const f = parseInt(hex.slice(1), 16);
  const t = percent < 0 ? 0 : 255;
  const p = Math.abs(percent) / 100;
  const R = f >> 16;
  const G = (f >> 8) & 0x00ff;
  const B = f & 0x0000ff;
  const r = Math.round((t - R) * p) + R;
  const g = Math.round((t - G) * p) + G;
  const b = Math.round((t - B) * p) + B;
  return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
}

export type BuiltSprite = {
  cells: SpriteCell[];
  /** True when the keyboard glow / typing-shake animation should run. */
  typing: boolean;
};
