/**
 * Shared "material" recipes for the Skills armory. On the dark theme, surfaces
 * differ by only ~6% lightness and borders are near-invisible, so depth has to
 * come from a subtle top→bottom gradient, a 1px top light-catch (inset white),
 * a readable border, and an accent-tinted lift on hover. All token-based so
 * both themes stay correct.
 */

// Standard raised tile (skill cards, panels).
export const SURFACE_CARD =
  "border border-line-2 " +
  "bg-[linear-gradient(180deg,color-mix(in_oklab,var(--bg-1)_94%,#fff),var(--bg-1))] " +
  "shadow-[inset_0_1px_0_color-mix(in_oklab,#fff_8%,transparent),0_2px_8px_-3px_rgba(0,0,0,0.5)]";

// Hover accent — border brightens, keeping the subtle top light-catch. No drop
// glow (it read as too heavy); the card's -translate-y lift carries the motion.
export const SURFACE_CARD_HOVER =
  "hover:border-ao-accent-line " +
  "hover:shadow-[inset_0_1px_0_color-mix(in_oklab,#fff_12%,transparent)]";

// Larger hero surface (overview band).
export const SURFACE_HERO =
  "border border-line-2 " +
  "bg-[linear-gradient(180deg,color-mix(in_oklab,var(--bg-1)_90%,#fff),var(--bg-1))] " +
  "shadow-[inset_0_1px_0_color-mix(in_oklab,#fff_10%,transparent),0_8px_24px_-18px_rgba(0,0,0,0.35)]";

// Inset well (search field wrappers, decorative racks).
export const SURFACE_WELL =
  "border border-line " +
  "bg-[linear-gradient(180deg,var(--bg-0),color-mix(in_oklab,var(--bg-0)_88%,#000))] " +
  "shadow-[inset_0_1px_2px_rgba(0,0,0,0.35)]";
