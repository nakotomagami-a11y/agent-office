/**
 * Sweeps a thin highlight across an element's top edge — the "this is
 * live" tell shared by every amber/green alert box in the app (the roster
 * and project-tab hover cards, the project dashboard's "reply to agent"
 * card). Matches the original design exactly (verified against the mock
 * with `getComputedStyle`: always this green regardless of the box's own
 * tint, `@keyframes quick-view-sweep` in `app/styles/animations.css`).
 *
 * The parent must be `position:relative; overflow:hidden` — callers decide
 * WHETHER to render this (e.g. only for green/amber tones, never red/grey);
 * this component is purely the visual.
 */
export function LiveSweep() {
  return (
    <span
      aria-hidden
      className="absolute top-0 left-0 h-px w-1/3"
      style={{
        background: "linear-gradient(90deg, transparent, var(--green), transparent)",
        animation: "quick-view-sweep 2.5s linear infinite",
      }}
    />
  );
}
