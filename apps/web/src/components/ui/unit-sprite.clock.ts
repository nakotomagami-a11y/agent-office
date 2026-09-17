// Single shared frame counter for every UnitSprite on the page. All instances
// read from one clock instead of each starting its own loop - keeps re-renders
// synchronized and bounded regardless of how many sprites the page is showing.
//
// Power: the sprite sheets play at a low FPS, so the clock is driven by a
// setTimeout at that FPS and only *then* requests one animation frame. It
// deliberately does NOT run a raw requestAnimationFrame loop at the display
// refresh rate (60-120 Hz): an always-active rAF forces the compositor
// (WebKitGTK, in the Tauri Linux build) to run its full present pipeline every
// vsync even though the visible animation only changes a few times a second.
// Pacing at the real FPS cuts those compositor wake-ups ~8-15x for identical
// on-screen motion — a measurable battery win on the iGPU. The trailing
// requestAnimationFrame also means the clock naturally pauses while the
// document is hidden (rAF does not fire for a hidden/occluded window), and a
// visibilitychange guard hard-stops it as a belt-and-suspenders for compositors
// that keep firing rAF off-screen.
//
// The FPS is runtime-adjustable via `setUnitClockFps` so the performance store
// can slow it further in "lite" mode (see performance-store.ts).

const DEFAULT_FPS = 8;

let frameMs = 1000 / DEFAULT_FPS;
let frame = 0;
let timer: ReturnType<typeof setTimeout> | null = null;
let rafHandle = 0;
let started = false;
let visibilityBound = false;
const listeners = new Set<() => void>();

function advance(): void {
  frame = (frame + 1) >>> 0;
  listeners.forEach((fn) => fn());
  schedule();
}

function schedule(): void {
  // Wait one frame at the current FPS, then ask for a single animation frame.
  // Keeps the loop at the sprite FPS (not the 60-120 Hz refresh rate) and
  // auto-pauses when hidden.
  timer = setTimeout(() => {
    rafHandle = requestAnimationFrame(advance);
  }, frameMs);
}

function bindVisibility(): void {
  if (visibilityBound || typeof document === "undefined") return;
  visibilityBound = true;
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      // Hard pause: drop the pending timer/rAF so a backgrounded window does
      // zero animation work regardless of how the platform treats rAF.
      if (timer !== null) clearTimeout(timer);
      cancelAnimationFrame(rafHandle);
      timer = null;
      rafHandle = 0;
    } else if (started && timer === null && rafHandle === 0) {
      // Resume when the window is shown again and sprites still want ticks.
      schedule();
    }
  });
}

function ensureRunning(): void {
  if (started) return;
  if (typeof window === "undefined") return;
  started = true;
  bindVisibility();
  if (typeof document !== "undefined" && document.hidden) return; // start paused
  schedule();
}

function stop(): void {
  if (!started) return;
  if (timer !== null) clearTimeout(timer);
  cancelAnimationFrame(rafHandle);
  timer = null;
  rafHandle = 0;
  started = false;
}

/**
 * Set the shared sprite animation rate. Clamped to a sane range. A change takes
 * effect on the next scheduled frame; it never starts or stops the loop on its
 * own (subscribers do that). Used by the performance store: 8 FPS on "full",
 * slower on "lite".
 */
export function setUnitClockFps(fps: number): void {
  const clamped = Math.max(1, Math.min(30, fps));
  frameMs = 1000 / clamped;
}

/** Subscribe a callback for every frame advance. Returns an unsubscribe. */
export function subscribeUnitClock(cb: () => void): () => void {
  listeners.add(cb);
  ensureRunning();
  return () => {
    listeners.delete(cb);
    if (listeners.size === 0) stop();
  };
}

export function getUnitClockFrame(): number {
  return frame;
}

/** SSR-safe snapshot: always 0 on the server so hydration matches. */
export function getUnitClockServerFrame(): number {
  return 0;
}
