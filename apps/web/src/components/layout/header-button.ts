/**
 * The one look every top-bar control shares (theme toggle, update pill,
 * version, dev, refresh, …), so a new control cannot drift from the row.
 */
export const HEADER_SHEEN =
  "group surface-sheen h-[38px] shrink-0 flex items-center rounded-full shadow-[var(--lift)] cursor-pointer " +
  "transition-[transform,box-shadow,color] duration-200 hover:-translate-y-px " +
  "hover:shadow-[0_28px_58px_-26px_rgba(0,0,0,0.95),0_4px_16px_-4px_color-mix(in_srgb,var(--acc)_32%,transparent),inset_0_1px_0_rgba(255,255,255,0.12)] " +
  "active:translate-y-0 active:shadow-[var(--lift)] " +
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-acc";

export const HEADER_ICON_BTN = `${HEADER_SHEEN} w-[38px] justify-center text-txt-2 hover:text-txt`;
