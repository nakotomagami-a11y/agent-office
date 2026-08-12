// In-app updater helpers (Tauri only).
//
// Mirrors tauri-window.ts: every call no-ops in a browser tab so the same
// React code ships to both targets. Uses dynamic imports so the plugin
// bundles are never pulled into a browser build where they'd 404.

import { isTauri, openExternalUrl } from "./tauri-window";

export type UpdateInfo = {
  version: string;
  currentVersion: string;
  notes?: string;
  date?: string;
};

export type DownloadProgress = (fraction: number | null) => void;

export type PendingUpdate = {
  info: UpdateInfo;
  /** Downloads + installs the update, reporting 0..1 progress (null = unknown size). */
  install: (onProgress?: DownloadProgress) => Promise<void>;
};

const REPO = "nakotomagami-a11y/agent-office";
export const RELEASES_URL = `https://github.com/${REPO}/releases/latest`;

/**
 * A detected update, unified across platforms:
 *  - `auto`   — Linux/Windows: the Tauri updater can download + install in place.
 *  - `manual` — macOS: no signed updater artifact yet, so we link to GitHub.
 */
export type UpdateStatus =
  | { kind: "auto"; info: UpdateInfo; install: PendingUpdate["install"] }
  | {
      kind: "manual";
      version: string;
      currentVersion: string;
      notes?: string;
      url: string;
    };

export function isMacOS(): boolean {
  return typeof navigator !== "undefined" && /Mac/i.test(navigator.userAgent);
}

function isNewerVersion(remote: string, current: string): boolean {
  const parse = (v: string) =>
    v.replace(/^v/, "").split("-")[0]!.split(".").map((n) => parseInt(n, 10) || 0);
  const a = parse(remote);
  const b = parse(current);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const d = (a[i] ?? 0) - (b[i] ?? 0);
    if (d !== 0) return d > 0;
  }
  return false;
}

async function getAppVersion(): Promise<string | null> {
  try {
    const { getVersion } = await import("@tauri-apps/api/app");
    return await getVersion();
  } catch {
    return null;
  }
}

async function fetchLatestRelease(): Promise<{ version: string; notes?: string; url: string } | null> {
  const res = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, {
    headers: { Accept: "application/vnd.github+json" },
  });
  if (!res.ok) return null;
  const j = (await res.json()) as { tag_name?: string; body?: string; html_url?: string };
  const version = String(j.tag_name ?? "").replace(/^v/, "");
  if (!version) return null;
  return {
    version,
    notes: typeof j.body === "string" ? j.body : undefined,
    url: j.html_url ?? RELEASES_URL,
  };
}

/**
 * Cross-platform "is there an update?" probe. Returns null in the browser,
 * when up to date, or on error. Linux/Windows use the signed Tauri updater;
 * macOS falls back to a GitHub release version check (manual install).
 */
export async function detectUpdate(): Promise<UpdateStatus | null> {
  if (!isTauri()) return null;

  if (!isMacOS()) {
    const pending = await checkForUpdate();
    if (!pending) return null;
    return { kind: "auto", info: pending.info, install: pending.install };
  }

  try {
    const remote = await fetchLatestRelease();
    if (!remote) return null;
    const current = (await getAppVersion()) ?? "0.0.0";
    if (!isNewerVersion(remote.version, current)) return null;
    return {
      kind: "manual",
      version: remote.version,
      currentVersion: current,
      notes: remote.notes,
      url: remote.url,
    };
  } catch {
    return null;
  }
}

/** Opens the GitHub releases page in the user's browser (macOS manual path). */
export function openReleasesPage(url: string = RELEASES_URL): void {
  void openExternalUrl(url);
}

/**
 * Asks the update endpoint whether a newer signed build exists.
 * Returns null in the browser, on error, or when already up to date.
 */
export async function checkForUpdate(): Promise<PendingUpdate | null> {
  if (!isTauri()) return null;
  try {
    const { check } = await import("@tauri-apps/plugin-updater");
    const update = await check();
    if (!update) return null;

    return {
      info: {
        version: update.version,
        currentVersion: update.currentVersion,
        notes: update.body,
        date: update.date,
      },
      install: async (onProgress) => {
        let total = 0;
        let downloaded = 0;
        await update.downloadAndInstall((event) => {
          switch (event.event) {
            case "Started":
              total = event.data.contentLength ?? 0;
              onProgress?.(0);
              break;
            case "Progress":
              downloaded += event.data.chunkLength;
              onProgress?.(total ? downloaded / total : null);
              break;
            case "Finished":
              onProgress?.(1);
              break;
          }
        });
      },
    };
  } catch {
    return null;
  }
}

/** Restarts the app so the freshly-installed update takes effect. */
export async function relaunchApp(): Promise<void> {
  if (!isTauri()) return;
  try {
    const { relaunch } = await import("@tauri-apps/plugin-process");
    await relaunch();
  } catch {
    // ignore — user can restart manually
  }
}

/** Custom DOM event a manual "Check for updates" control can dispatch. */
export const CHECK_UPDATE_EVENT = "office:check-update";

export function requestUpdateCheck(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(CHECK_UPDATE_EVENT));
}
