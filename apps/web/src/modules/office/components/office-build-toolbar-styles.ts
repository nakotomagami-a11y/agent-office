import type { CSSProperties } from "react";

/* Complex gradients / multi-layer shadows — expressed as constants because
   Tailwind's JIT collapses multi-value shadow arbitraries. Simple token colours
   still use Tailwind classes (text-acc, bg-bg-2, …) in the markup. */
export const ACC_GRAD = "linear-gradient(180deg, color-mix(in srgb, var(--acc) 88%, #fff), var(--acc))";
export const PANEL_SHADOW =
  "inset 0 1px 0 rgba(255,255,255,0.05), 0 2px 8px rgba(0,0,0,0.28), 0 28px 64px -20px rgba(0,0,0,0.62)";
export const TOOLWELL_SHADOW = "inset 0 1px 3px rgba(0,0,0,0.32)";
export const TOOL_ACTIVE_SHADOW =
  "inset 0 1px 0 rgba(255,255,255,0.3), 0 3px 10px -2px color-mix(in srgb, var(--acc) 55%, transparent), 0 0 0 1px color-mix(in srgb, var(--acc) 50%, transparent)";
export const TILE_BG = "radial-gradient(78% 54% at 50% 32%, rgba(255,255,255,0.055), transparent 72%), var(--bg-2)";
export const TILE_BG_SEL =
  "radial-gradient(80% 60% at 50% 28%, color-mix(in srgb, var(--acc) 24%, transparent), transparent 74%), var(--bg-2)";
export const TILE_SHADOW_SEL =
  "0 0 0 1px color-mix(in srgb, var(--acc) 32%, transparent), 0 10px 24px -10px color-mix(in srgb, var(--acc) 50%, transparent)";
export const THUMB_BG = "radial-gradient(70% 60% at 50% 34%, rgba(255,255,255,0.07), transparent 72%), var(--bg-3)";
export const GEN_SHADOW =
  "0 5px 16px -4px color-mix(in srgb, var(--acc) 55%, transparent), inset 0 1px 0 rgba(255,255,255,0.26)";
export const ACC_BORDER = "color-mix(in srgb, var(--acc) 35%, transparent)";

export const TILE_BASIS: CSSProperties = { flexBasis: "calc(25% - 6px)", maxWidth: "calc(25% - 6px)", minHeight: 66 };
