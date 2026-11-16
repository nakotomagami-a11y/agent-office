// Native folder picker. Desktop app only: a browser tab can't hand back a local path, so callers hide the button there.

import { isTauri } from "./tauri-window";

/** The folder the user picked, or null if they cancelled or this isn't the desktop app. */
export async function pickFolder(defaultPath?: string): Promise<string | null> {
  if (!isTauri()) return null;
  const [{ open }, { homeDir, join }] = await Promise.all([import("@tauri-apps/plugin-dialog"), import("@tauri-apps/api/path")]);
  const start = defaultPath?.trim();
  // The dialog takes a real path; the field often holds "~/…".
  const resolved = start?.startsWith("~") ? await join(await homeDir(), start.slice(1).replace(/^[\\/]/, "")) : start;
  const picked = await open({ directory: true, multiple: false, defaultPath: resolved || undefined });
  return typeof picked === "string" ? picked : null;
}
