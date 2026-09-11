// Tauri window API helpers. No-op in a plain browser tab so the same React
// code ships to both targets.

interface TauriWindow {
  close: () => Promise<void>;
  minimize: () => Promise<void>;
  toggleMaximize: () => Promise<void>;
}

// Only cache a successful probe — a failed one must retry on the next call.
let cached: TauriWindow | null = null;

async function getTauriWindow(): Promise<TauriWindow | null> {
  if (cached) return cached;
  if (!isTauri()) return null;
  try {
    const mod = await import("@tauri-apps/api/window");
    const w = mod.getCurrentWindow();
    cached = {
      close: () => w.close(),
      minimize: () => w.minimize(),
      toggleMaximize: () => w.toggleMaximize(),
    };
    return cached;
  } catch {
    return null;
  }
}

export function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

// Surfaces a failed window op as a toast + console error instead of
// swallowing it, so it's diagnosable without opening devtools.
async function reportWindowError(op: string, err: unknown): Promise<void> {
  const msg = err instanceof Error ? err.message : String(err);
  console.error(`tauri-window.${op} failed`, err);
  try {
    const { toast } = await import("./toast-store");
    toast(`Window ${op} failed: ${msg}`);
  } catch {
    /* toast store unavailable — console.error above still fired */
  }
}

// close/minimize/toggleMaximize are fired from fire-and-forget onClick
// handlers, so errors are caught and reported here rather than thrown.
export async function closeWindow(): Promise<void> {
  const w = await getTauriWindow();
  try {
    await w?.close();
  } catch (err) {
    await reportWindowError("close", err);
  }
}

export async function minimizeWindow(): Promise<void> {
  const w = await getTauriWindow();
  try {
    await w?.minimize();
  } catch (err) {
    await reportWindowError("minimize", err);
  }
}

export async function toggleMaximizeWindow(): Promise<void> {
  const w = await getTauriWindow();
  try {
    await w?.toggleMaximize();
  } catch (err) {
    await reportWindowError("toggleMaximize", err);
  }
}

// Opens a URL in the system browser. `window.open()` is a no-op in the Tauri
// webview, so use the shell plugin there; falls back to `window.open` otherwise.
export async function openExternalUrl(url: string): Promise<void> {
  if (isTauri()) {
    try {
      const { open } = await import("@tauri-apps/plugin-shell");
      await open(url);
      return;
    } catch {
      // fall through to window.open as a last resort
    }
  }
  if (typeof window !== "undefined") {
    window.open(url, "_blank", "noopener,noreferrer");
  }
}

export type ResizeDirection = 'East' | 'North' | 'NorthEast' | 'NorthWest' | 'South' | 'SouthEast' | 'SouthWest' | 'West';

export async function startResizeDragging(direction: ResizeDirection): Promise<void> {
  if (!isTauri()) return;
  try {
    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    await getCurrentWindow().startResizeDragging(direction);
  } catch {
    // ignore — not critical if resize drag fails
  }
}
