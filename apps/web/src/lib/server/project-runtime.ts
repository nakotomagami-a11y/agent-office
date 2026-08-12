// Server-only helpers shared by the project runtime routes (dev / install).
// Keeps package-manager detection, package-dir resolution, and the PATH
// bootstrap in one place so `install` targets exactly what `dev` detects.

import { existsSync } from "node:fs";
import { join } from "node:path";

/** Subfolders the project bootstrapper emits / common monorepo layouts. Kept in
 *  sync with the same list in the dev route's `detectDevCommands`. */
const SUBFOLDERS = ["frontend", "backend", "web", "client", "server", "api"] as const;

export function detectPackageManager(dir: string): string {
  if (existsSync(join(dir, "pnpm-lock.yaml"))) return "pnpm";
  if (existsSync(join(dir, "yarn.lock"))) return "yarn";
  if (existsSync(join(dir, "bun.lockb")) || existsSync(join(dir, "bun.lock"))) return "bun";
  return "npm";
}

/**
 * Where `npm/pnpm/yarn/bun install` should actually run for a project.
 *
 * - Root has a package.json → install the root only (covers workspace monorepos).
 * - Otherwise → the bootstrapped subfolders (frontend/, backend/, …) that carry
 *   their own package.json, matching what the dev route detects. This is why the
 *   old install route failed on split front/back projects: it ran at the bare
 *   root, where there's no package.json.
 */
export function resolvePackageDirs(cwd: string): string[] {
  if (existsSync(join(cwd, "package.json"))) return [cwd];
  return SUBFOLDERS
    .map((sub) => join(cwd, sub))
    .filter((dir) => existsSync(join(dir, "package.json")));
}

/**
 * PATH bootstrap prepended to any `bash -lc` that runs a package manager. A
 * GUI-launched desktop app inherits a minimal PATH without nvm/pnpm/bun, so
 * `npm/pnpm/bun` wouldn't resolve. Mirrors the setup the dev-server launcher
 * uses (see dev route `spawnInTerminal`). Ends with "; " so it composes.
 */
export const PM_PATH_SETUP =
  [
    '[ -d "$HOME/.local/share/pnpm" ] && export PATH="$HOME/.local/share/pnpm:$PATH"',
    'export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"; [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"',
    'command -v nvm >/dev/null && { nvm use default >/dev/null 2>&1 || nvm use node >/dev/null 2>&1 || nvm use --lts >/dev/null 2>&1 || true; }',
    '[ -d "$HOME/.bun/bin" ] && export PATH="$HOME/.bun/bin:$PATH"',
  ].join("; ") + "; ";
