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
