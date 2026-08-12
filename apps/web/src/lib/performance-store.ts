import { useEffect } from "react";
import { create } from "zustand";
import { getUiSettings, patchUiSettings } from "@/lib/api/ui-settings";

/**
 * Rendering / animation budget.
 *
 *   - `full` (default)  — everything on: iso office renderer via PixiJS,
 *                         framer-motion transitions, CSS keyframes,
 *                         backdrop-blur, drop shadows, procedural planet
 *                         icons, hover transitions.
 *   - `lite`            — office view forced to `cards`. Non-essential CSS
 *                         animations off. Framer-motion transitions set to
 *                         0 ms. Backdrop-blur removed. Planet icons render
 *                         as a flat color fallback. Status LEDs still
 *                         animate (essential feedback).
 *   - `off`             — everything from `lite` PLUS: no hover
 *                         transitions, no shimmer, no chat message-in
 *                         animations, no auto-scroll smoothing.
 *
 * Persisted server-side to `ui_settings.performance-mode`. Applied to the
 * DOM as `<html data-perf="lite">` (attribute is dropped for `full` so
 * default CSS reads as before). CSS in `globals.css` gates expensive
 * rules on that attribute.
 */
export type PerformanceMode = "full" | "lite" | "off";

const DOC_ATTR = "data-perf";
const STORAGE_KEY = "performance-mode";

type PerformanceState = {
  mode: PerformanceMode;
  hydrated: boolean;
  /**
   * True when we auto-detected the initial mode from
   * `prefers-reduced-motion: reduce`. Used to surface a one-time notice on
   * the About You page so the user knows why animations are muted.
   */
  autoDetected: boolean;
  setMode: (next: PerformanceMode) => void;
  hydrate: () => void;
};

function writeDom(mode: PerformanceMode) {
  if (typeof document === "undefined") return;
  if (mode === "full") {
    document.documentElement.removeAttribute(DOC_ATTR);
  } else {
    document.documentElement.setAttribute(DOC_ATTR, mode);
  }
}

function isValidMode(v: unknown): v is PerformanceMode {
  return v === "full" || v === "lite" || v === "off";
}

/** OS-level reduced-motion detection. Used ONLY as a fallback default. */
function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
}

export const usePerformanceStore = create<PerformanceState>((set, get) => ({
  mode: "full",
  hydrated: false,
  autoDetected: false,
  setMode: (next) => {
    writeDom(next);
    // Manual set always clears the auto-detected flag so the About You
    // hint stops showing once the user has made an explicit choice.
    set({ mode: next, autoDetected: false });
    patchUiSettings({ [STORAGE_KEY]: next }).catch(() => {
      /* best-effort — DOM is already correct */
    });
  },
  hydrate: () => {
    if (get().hydrated) return;

    // Optimistic default: if the OS signals reduced motion, start on
    // `lite` so the first paint isn't full-fat. If the server later
    // reports a stored value, we honor that instead.
    const osFallback: PerformanceMode = prefersReducedMotion() ? "lite" : "full";
    writeDom(osFallback);
    set({ mode: osFallback, hydrated: true, autoDetected: osFallback !== "full" });

    getUiSettings()
      .then((data) => {
        const stored = data[STORAGE_KEY];
        if (isValidMode(stored)) {
          writeDom(stored);
          set({ mode: stored, autoDetected: false });
        }
      })
      .catch(() => {
        /* stick with fallback */
      });
  },
}));

/**
 * Mount-time hook. Call once near the root so the store reads the
 * persisted value and aligns the DOM attribute. Skips work after the
 * first hydration to avoid render loops.
 */
export function usePerformanceHydration() {
  const hydrate = usePerformanceStore((s) => s.hydrate);
  useEffect(() => {
    hydrate();
  }, [hydrate]);
}
