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

// Only the successful probe is cached. A failed probe (bridge not ready yet,
// or a transient import error) is NOT cached — otherwise one unlucky click
// before `__TAURI_INTERNALS__` finishes injecting would wedge every window
// control (close/minimize/maximize) into a silent no-op for the rest of the
// session, since every future call short-circuited on the cached `null`
// instead of trying again.
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

// Callers fire these from a plain `onClick={() => void closeWindow()}` with
// nothing downstream awaiting the result, so an unhandled rejection here
// (e.g. a denied ACL permission) would otherwise vanish into the console as
// an "uncaught (in promise)" with no indication *why* the button did
// nothing. Swallow-and-log instead of throwing back into a fire-and-forget
// caller.
export async function closeWindow(): Promise<void> {
  const w = await getTauriWindow();
  try {
    await w?.close();
  } catch (err) {
    console.error("tauri-window.close failed", err);
  }
}

export async function minimizeWindow(): Promise<void> {
  const w = await getTauriWindow();
  try {
    await w?.minimize();
  } catch (err) {
    console.error("tauri-window.minimize failed", err);
  }
}

export async function toggleMaximizeWindow(): Promise<void> {
  const w = await getTauriWindow();
  try {
    await w?.toggleMaximize();
  } catch (err) {
    console.error("tauri-window.toggleMaximize failed", err);
  }
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
