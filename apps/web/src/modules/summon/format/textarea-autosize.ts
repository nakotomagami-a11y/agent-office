/**
 * Auto-grow a textarea to fit its content, capped so a giant paste doesn't
 * shove the toolbar off-screen. The cap scales with the viewport (~45% of the
 * window height, clamped to 220–520px) so long messages stay readable on tall
 * screens. Safe to call with `null`.
 */
export function autosizeTextarea(el: HTMLTextAreaElement | null): void {
  if (!el) return;
  const vh = typeof window === "undefined" ? 800 : window.innerHeight;
  const cap = Math.max(220, Math.min(520, Math.round(vh * 0.45)));
  el.style.height = "auto";
  el.style.height = Math.min(cap, el.scrollHeight) + "px";
}
