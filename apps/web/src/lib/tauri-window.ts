// Helpers for talking to the Tauri window API.
//
// When the app runs in a browser tab the Tauri APIs aren't available;
// every function in here no-ops in that environment so the same React
// code can ship to both targets.

interface TauriWindow {
  close: () => Promise<void>;
  minimize: () => Promise<void>;
  toggleMaximize: () => Promise<void>;
}

let cached: TauriWindow | null | undefined; // undefined = not yet probed

async function getTauriWindow(): Promise<TauriWindow | null> {
  if (cached !== undefined) return cached;
  if (typeof window === "undefined") {
    cached = null;
    return null;
  }
  // The Tauri runtime injects this global early. Probing it avoids
  // pulling in the @tauri-apps/api module in a browser tab where it
  // would 404 on dynamic import.
  if (!("__TAURI_INTERNALS__" in window)) {
    cached = null;
    return null;
  }
  try {
    const mod = await import("@tauri-apps/api/window");
    const w = mod.getCurrentWindow();
    cached = {
      close: () => w.close(),
      minimize: () => w.minimize(),
      toggleMaximize: () => w.toggleMaximize(),
    };
  } catch {
    cached = null;
  }
  return cached;
}

export function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export async function closeWindow(): Promise<void> {
  const w = await getTauriWindow();
  await w?.close();
}

export async function minimizeWindow(): Promise<void> {
  const w = await getTauriWindow();
  await w?.minimize();
}

export async function toggleMaximizeWindow(): Promise<void> {
  const w = await getTauriWindow();
  await w?.toggleMaximize();
}

/**
 * Opens a URL in the user's default system browser.
 *
 * `window.open()` is a no-op inside the Tauri webview (there's no browser
 * tab for it to open) — the app needs the shell plugin's `open()` to hand
 * the URL off to the OS. Falls back to `window.open` in a plain browser tab.
 */
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
