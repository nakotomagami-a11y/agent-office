// Single shared rAF-driven frame counter for every UnitSprite on the page.
// All instances read from one clock instead of each starting its own loop -
// keeps re-renders synchronized and bounded regardless of how many sprites
// the page is currently showing.

const FPS = 8;
const FRAME_MS = 1000 / FPS;

let frame = 0;
let rafHandle = 0;
let last = 0;
let started = false;
const listeners = new Set<() => void>();

function tick(now: number): void {
  if (now - last >= FRAME_MS) {
    last = now;
    // Bump the global frame; per-sprite frame index = frame % totalFrames.
    frame = (frame + 1) >>> 0;
    listeners.forEach((fn) => fn());
  }
  rafHandle = requestAnimationFrame(tick);
}

function ensureRunning(): void {
  if (started) return;
  if (typeof window === "undefined") return;
  started = true;
  last = performance.now();
  rafHandle = requestAnimationFrame(tick);
}

function stop(): void {
  if (!started) return;
  cancelAnimationFrame(rafHandle);
  started = false;
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
