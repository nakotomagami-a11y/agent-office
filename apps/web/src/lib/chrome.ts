/**
 * Height (px) of the top bar every page renders at the top of `<main>`
 * (see `components/layout/main-top-bar.tsx`) — project tabs, Docs, theme
 * toggle, account/nav chip. Replaces the old fixed Titlebar (38) +
 * TabStrip (36) = 74px overlay with a single in-flow row.
 *
 * Modals anchor their backdrop below this row (`style={{ top: CHROME_TOP }}`)
 * so the row stays visible instead of being covered — single source of
 * truth instead of four independent `top: 74` literals.
 */
export const CHROME_TOP = 70;

/**
 * Left offset every modal backdrop anchors to, matching the roster
 * `<aside>`'s width at each breakpoint (see `components/layout/main-shell.tsx`
 * — `w-[252px] max-[1024px]:w-[64px] max-[600px]:hidden`): 252px full width,
 * 64px icon rail below 1024px, 0 below 600px where the sidebar itself hides
 * (mobile bottom nav takes over). Same reasoning as `CHROME_TOP` — the
 * sidebar should stay visible/usable behind an open modal instead of being
 * covered by the backdrop, so every modal's left edge stops here. Literal
 * Tailwind classes (not an inline style) because the offset is responsive;
 * pair with `style={{ top: CHROME_TOP }}` on the same element.
 */
export const CHROME_LEFT_CLASS = "left-[252px] max-[1024px]:left-[64px] max-[600px]:left-0";
