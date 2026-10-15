/**
 * Whether a capture-phase scroll event moved `anchor` on screen — true only
 * when the element that scrolled contains it. Portalled `position: fixed`
 * overlays close on this: a capture listener on `window` hears every scroller
 * on the page, and closing on all of them made menus in the agent modal
 * vanish whenever a streaming chat auto-scrolled its own body.
 */
export function scrollMovesAnchor(e: Event, anchor: Node | null | undefined): boolean {
  if (!anchor) return true;
  const target = e.target as Node | null;
  return typeof target?.contains === "function" && target.contains(anchor);
}
