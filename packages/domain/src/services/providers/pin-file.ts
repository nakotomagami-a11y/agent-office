// The per-run `--settings` file on disk: written 0600 with `wx`, deleted when the run ends, swept
// at boot after a crash. It holds the run's gateway token, never a provider key. summon.ts also
// prunes tmp-prompts files older than 6 h, above the 4 h run cap, so a live pin is never pruned.

import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { isBackendEnvName } from "../../config/providers";
import { log } from "../infra/log";
import { TMP_PROMPTS_DIR } from "../infra/paths";
import type { SettingsPin } from "./env";

const PIN_PREFIX = "settings-pin-";
const MAX_SETTINGS_BYTES = 1024 * 1024;

/** Repo-controlled: a symlink to a FIFO or device would block the server's thread on read. */
function envKeysOf(file: string): string[] {
  try {
    if (!existsSync(file)) return [];
    const st = statSync(file);
    if (!st.isFile() || st.size > MAX_SETTINGS_BYTES) return [];
    const raw: unknown = JSON.parse(readFileSync(file, "utf8"));
    if (!raw || typeof raw !== "object" || !("env" in raw)) return [];
    const env = raw.env;
    return env && typeof env === "object" && !Array.isArray(env) ? Object.keys(env) : [];
  } catch {
    log.warn("provider.settings_unparseable", { file });
    return [];
  }
}

/** Backend env names a user or repo settings file sets; each gets pinned to `""` or its value. */
export function discoverBackendEnvNames(cwd: string | undefined, userConfigDir: string): string[] {
  const files = [join(userConfigDir, "settings.json")];
  if (cwd) files.push(join(cwd, ".claude", "settings.json"), join(cwd, ".claude", "settings.local.json"));
  return [...new Set(files.flatMap(envKeysOf).filter(isBackendEnvName))];
}

export function writePinFile(pin: SettingsPin): string {
  mkdirSync(TMP_PROMPTS_DIR, { recursive: true });
  const file = join(TMP_PROMPTS_DIR, `${PIN_PREFIX}${randomUUID()}.json`);
  writeFileSync(file, JSON.stringify(pin), { flag: "wx", mode: 0o600 });
  return file;
}

export function removePinFile(file: string | undefined): void {
  if (!file) return;
  try {
    unlinkSync(file);
  } catch {
    // Already gone.
  }
}

/** Pins older than `maxAgeMs` belong to runs that no longer exist (a crash skipped their cleanup). */
export function sweepPinFiles(maxAgeMs: number, now = Date.now()): number {
  if (!existsSync(TMP_PROMPTS_DIR)) return 0;
  let removed = 0;
  for (const name of readdirSync(TMP_PROMPTS_DIR)) {
    if (!name.startsWith(PIN_PREFIX)) continue;
    const file = join(TMP_PROMPTS_DIR, name);
    try {
      if (now - statSync(file).mtimeMs > maxAgeMs) {
        unlinkSync(file);
        removed++;
      }
    } catch {
      // Removed concurrently.
    }
  }
  return removed;
}
