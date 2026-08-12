/**
 * Auto-grow a textarea to fit its content, capped at 220px so a giant paste
 * doesn't shove the toolbar off-screen. Safe to call with `null`.
 */
export function autosizeTextarea(el: HTMLTextAreaElement | null): void {
  if (!el) return;
  el.style.height = "auto";
  el.style.height = Math.min(220, el.scrollHeight) + "px";
}
