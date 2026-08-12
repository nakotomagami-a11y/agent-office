/**
 * Accent (purple) button — the raised, glowing look shared by the build-toolbar
 * CTA and every primary purple button in the app. Pure Tailwind so the style
 * stays co-located with the markup (no globals.css class). Apply via `cn()` or
 * string interpolation. Conflicting base classes are resolved by tailwind-merge
 * (last wins), so passing this after a base class string overrides bg/shadow.
 */
export const ACCENT_BTN =
  "text-[var(--acc-ink)] border border-[color-mix(in_srgb,var(--acc)_35%,transparent)] " +
  "bg-[linear-gradient(180deg,color-mix(in_srgb,var(--acc)_88%,#fff),var(--acc))] " +
  "shadow-[0_5px_16px_-4px_color-mix(in_srgb,var(--acc)_55%,transparent),inset_0_1px_0_rgba(255,255,255,0.26)] " +
  "transition-[filter,transform,box-shadow] duration-150 " +
  "hover:brightness-[1.07] hover:-translate-y-px " +
  "hover:shadow-[0_8px_22px_-6px_color-mix(in_srgb,var(--acc)_62%,transparent),inset_0_1px_0_rgba(255,255,255,0.3)] " +
  "active:translate-y-0 active:brightness-[0.97] " +
  "disabled:bg-none disabled:bg-bg-3 disabled:border-line disabled:text-txt-3 disabled:shadow-none disabled:brightness-100 disabled:translate-y-0 disabled:cursor-not-allowed";
