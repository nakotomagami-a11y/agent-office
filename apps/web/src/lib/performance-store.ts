import { useEffect } from "react";
import { create } from "zustand";
import { getUiSettings, patchUiSettings } from "@/lib/api/ui-settings";
import { setUnitClockFps } from "@/components/ui/unit-sprite.clock";

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
 *                         animate (essential feedback). Sprite clock slowed.
 *   - `off`             — everything from `lite` PLUS: no hover
 *                         transitions, no shimmer, no chat message-in
 *                         animations, no auto-scroll smoothing, sprite
 *                         animation paused.
 *
 * Persisted server-side to `ui_settings.performance-mode`. Applied to the
 * DOM as `<html data-perf="lite">` (attribute is dropped for `full` so
 * default CSS reads as before). CSS in `globals.css` gates expensive
 * rules on that attribute.
 *
 * Auto power mode: when `auto` is on (default), the mode follows the machine's
 * power source — `full` on AC ("quality"), `lite` on battery ("performance").
 * It is edge-triggered on plug/unplug transitions only, so a manual change in
 * Settings sticks until the next transition (we never fight the user). See
 * `applyPowerState` + `PowerSync`.
 */
export type PerformanceMode = "full" | "lite" | "off";

type PowerState = "ac" | "battery";

const DOC_ATTR = "data-perf";
const STORAGE_KEY = "performance-mode";
const AUTO_KEY = "performance-auto";

/** Sprite animation FPS per mode. `off` pauses sprites entirely (see
 *  UnitSprite), so its value here is moot; `lite` runs slower to save power. */
function modeToClockFps(mode: PerformanceMode): number {
  return mode === "lite" ? 4 : 8;
}

/** Which mode a power source maps to under auto: AC = quality, battery = perf. */
function powerToMode(state: PowerState): PerformanceMode {
  return state === "ac" ? "full" : "lite";
}

type PerformanceState = {
  mode: PerformanceMode;
  hydrated: boolean;
  /**
   * True when we auto-detected the initial mode from
   * `prefers-reduced-motion: reduce`. Used to surface a one-time notice on
   * the About You page so the user knows why animations are muted.
   */
  autoDetected: boolean;
  /** Follow the power source automatically (quality on AC, perf on battery). */
  auto: boolean;
  /** Last known power source, for edge-triggering auto switches. */
  powerState: PowerState | null;
  setMode: (next: PerformanceMode) => void;
  setAuto: (on: boolean) => void;
  /** Called by PowerSync when the AC/battery state is read or changes. */
  applyPowerState: (onAc: boolean) => void;
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

/** Apply a mode to the DOM + sprite clock. Does NOT persist unless asked. */
function applyMode(
  set: (partial: Partial<PerformanceState>) => void,
  mode: PerformanceMode,
  persist: boolean,
) {
  writeDom(mode);
  setUnitClockFps(modeToClockFps(mode));
  set({ mode });
  if (persist) {
    patchUiSettings({ [STORAGE_KEY]: mode }).catch(() => {
      /* best-effort — DOM is already correct */
    });
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
  auto: true,
  powerState: null,
  setMode: (next) => {
    // Manual set always clears the auto-detected flag so the About You
    // hint stops showing once the user has made an explicit choice. We keep
    // `auto` on: the switch is edge-triggered, so this manual choice sticks
    // until the next plug/unplug — respecting the user without disabling the
    // feature outright.
    applyMode(set, next, true);
    set({ autoDetected: false });
  },
  setAuto: (on) => {
    set({ auto: on });
    patchUiSettings({ [AUTO_KEY]: on ? "true" : "false" }).catch(() => {});
    // Turning auto on: immediately reconcile with the current power source.
    const ps = get().powerState;
    if (on && ps) applyMode(set, powerToMode(ps), false);
  },
  applyPowerState: (onAc) => {
    const next: PowerState = onAc ? "ac" : "battery";
    const prev = get().powerState;
    set({ powerState: next });
    if (!get().auto) return; // just track; auto is off
    if (prev === next) return; // no transition → don't override a manual choice
    applyMode(set, powerToMode(next), false);
  },
  hydrate: () => {
    if (get().hydrated) return;

    // Optimistic default: if the OS signals reduced motion, start on
    // `lite` so the first paint isn't full-fat. If the server later
    // reports a stored value, we honor that instead.
    const osFallback: PerformanceMode = prefersReducedMotion() ? "lite" : "full";
    writeDom(osFallback);
    setUnitClockFps(modeToClockFps(osFallback));
    set({ mode: osFallback, hydrated: true, autoDetected: osFallback !== "full" });

    getUiSettings()
      .then((data) => {
        const storedAuto = data[AUTO_KEY];
        const auto = storedAuto === undefined ? true : storedAuto === "true";
        set({ auto });

        const stored = data[STORAGE_KEY];
        // When auto is on the concrete mode is driven by the power source
        // (PowerSync calls applyPowerState shortly after mount). We still
        // seed the stored mode as a baseline for the brief pre-power window.
        // When auto is off, the stored mode is authoritative.
        if (isValidMode(stored)) {
          applyMode(set, stored, false);
          set({ autoDetected: false });
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
