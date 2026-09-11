// Server-only helpers shared by the project runtime routes (dev / install).
// Keeps package-manager detection, package-dir resolution, and the PATH
// bootstrap in one place so `install` targets exactly what `dev` detects.

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import * as net from "node:net";
import type { DetectedCommand } from "@agent-office/domain/types";

/** Subfolders the project bootstrapper emits / common monorepo layouts. Only
 *  a fallback for projects that don't declare a real workspace config — see
 *  `resolveWorkspacePackageDirs` for the general case (pnpm/npm/yarn/bun). */
const SUBFOLDERS = ["frontend", "backend", "web", "client", "server", "api"] as const;

/** Extract the `packages:` block-list from a pnpm-workspace.yaml body. */
function parsePnpmWorkspaceGlobs(yamlText: string): string[] {
  const lines = yamlText.split("\n");
  const start = lines.findIndex((l) => /^packages:\s*$/.test(l.trim()));
  if (start === -1) return [];
  const globs: string[] = [];
  for (const line of lines.slice(start + 1)) {
    if (!line.trim()) continue;
    if (!/^\s/.test(line)) break; // next top-level key
    const m = line.match(/^\s*-\s*['"]?([^'"]+?)['"]?\s*$/);
    if (m) globs.push(m[1]!);
  }
  return globs;
}

/** `packages:` globs from pnpm-workspace.yaml, or the npm/yarn/bun
 *  `workspaces` package.json field (`string[]` or `{ packages: string[] }`). */
function readWorkspaceGlobs(cwd: string): string[] {
  const pnpmPath = join(cwd, "pnpm-workspace.yaml");
  try {
    if (existsSync(pnpmPath)) {
      const globs = parsePnpmWorkspaceGlobs(readFileSync(pnpmPath, "utf8"));
      if (globs.length > 0) return globs;
    }
  } catch { /* ignore */ }

  const pkgPath = join(cwd, "package.json");
  try {
    if (existsSync(pkgPath)) {
      const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as { workspaces?: string[] | { packages?: string[] } };
      if (Array.isArray(pkg.workspaces)) return pkg.workspaces;
      if (pkg.workspaces?.packages) return pkg.workspaces.packages;
    }
  } catch { /* ignore */ }

  return [];
}

/** Resolve workspace globs to actual directories. Only supports a single
 *  trailing `*` segment (`apps/*`) or an exact path — covers the globs every
 *  real-world pnpm/npm/yarn/bun workspace we've seen actually uses. */
function resolveWorkspacePackageDirs(cwd: string): string[] {
  const dirs = new Set<string>();
  for (const glob of readWorkspaceGlobs(cwd)) {
    const clean = glob.replace(/\/$/, "");
    if (clean.includes("*")) {
      const prefix = clean.slice(0, clean.indexOf("*")).replace(/\/$/, "");
      const parentDir = join(cwd, prefix);
      try {
        for (const entry of readdirSync(parentDir, { withFileTypes: true })) {
          if (entry.isDirectory()) dirs.add(join(parentDir, entry.name));
        }
      } catch { /* not a real dir, e.g. an unsupported deeper glob */ }
    } else {
      const dir = join(cwd, clean);
      if (existsSync(dir)) dirs.add(dir);
    }
  }
  return [...dirs];
}

export function detectPackageManager(dir: string): string {
  if (existsSync(join(dir, "pnpm-lock.yaml"))) return "pnpm";
  if (existsSync(join(dir, "yarn.lock"))) return "yarn";
  if (existsSync(join(dir, "bun.lockb")) || existsSync(join(dir, "bun.lock"))) return "bun";
  return "npm";
}

/** Build/derived cache dirs removed by POST /api/projects/<id>/clear-cache. */
export const CACHE_DIRS = [".next", ".turbo", "node_modules/.cache"];

const BUILD_SCRIPT_PRIORITY = ["build", "build:prod", "build:production", "build:web", "build:app"];

/** The argv to build a project: a `.ao.json` `buildCommand` override, else the
 *  best-matching package.json `build*` script run through `pm`. Null if none. */
export function detectBuildCommand(cwd: string, pm: string): string[] | null {
  const aoPath = join(cwd, ".ao.json");
  if (existsSync(aoPath)) {
    try {
      const cfg = JSON.parse(readFileSync(aoPath, "utf8")) as { buildCommand?: string };
      if (typeof cfg.buildCommand === "string") return cfg.buildCommand.trim().split(/\s+/);
    } catch { /* ignore */ }
  }

  const pkgPath = join(cwd, "package.json");
  if (existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as { scripts?: Record<string, string> };
      const scripts = pkg.scripts ?? {};
      for (const key of BUILD_SCRIPT_PRIORITY) {
        if (scripts[key]) return [pm, "run", key];
      }
      const fallback = Object.keys(scripts).find((k) => /^build/.test(k));
      if (fallback) return [pm, "run", fallback];
    } catch { /* ignore */ }
  }

  return null;
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

// ─── Free-port allocation (dev servers) ──────────────────────────────────────

// Module-level set prevents two concurrent requests from picking the same port in
// the window between the "port is free" check and the process actually binding it.
const reservedPorts = new Set<number>();

/** Find a free TCP port in [start, start+100), reserving it for 30s so concurrent
 *  callers don't collide before the spawned process binds it. */
export async function findFreePort(start = 3001): Promise<number> {
  for (let p = start; p < start + 100; p++) {
    if (p === 5173) continue;
    if (reservedPorts.has(p)) continue;
    const free = await new Promise<boolean>((resolve) => {
      const s = net.createServer();
      s.once("error", () => resolve(false));
      s.once("listening", () => { s.close(() => resolve(true)); });
      s.listen(p, "127.0.0.1");
    });
    if (free) {
      reservedPorts.add(p);
      setTimeout(() => reservedPorts.delete(p), 30_000);
      return p;
    }
  }
  throw new Error("No free port found in range 3001–3100");
}

// ─── Dev-command detection ───────────────────────────────────────────────────

const DEV_SCRIPT_RE = /^(dev|start|serve|preview|watch|develop)([:.-].+)?$/;
const SKIP_SCRIPT_RE = /build|test|lint|type|check|emit|prepare|postinstall|prebuild/;

function scriptToName(key: string): string {
  if (key === "dev") return "Dev";
  if (key === "start") return "Start";
  if (key === "serve") return "Serve";
  if (key === "preview") return "Preview";
  return key.replace(/^(dev|start)[.:-]/, "").replace(/[-:]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

// Scan a single dir's package.json for dev-style scripts. With `opts` the dir is a
// subfolder (e.g. frontend/), so keys/names are prefixed to stay unique and a `cwd`
// override is attached so it spawns there. `pmOverride` forces the package manager
// instead of re-detecting from `dir`'s own lockfile — a real workspace member
// (declared via pnpm-workspace.yaml / package.json `workspaces`) shares its root's
// package manager and typically has no lockfile of its own.
function collectPkgCommands(dir: string, opts?: { keyPrefix: string; namePrefix: string; pmOverride?: string }): DetectedCommand[] {
  const pkgPath = join(dir, "package.json");
  if (!existsSync(pkgPath)) return [];
  const out: DetectedCommand[] = [];
  try {
    const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as {
      scripts?: Record<string, string>;
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };
    const isNextJs = "next" in allDeps;
    const scripts = pkg.scripts ?? {};
    const pm = opts?.pmOverride ?? detectPackageManager(dir);

    // Bare "dev"/"start" before "dev:*".
    const keys = Object.keys(scripts).sort((a, b) => {
      const aBase = !a.includes(":") && !a.includes("-");
      const bBase = !b.includes(":") && !b.includes("-");
      return aBase === bBase ? a.localeCompare(b) : aBase ? -1 : 1;
    });

    for (const key of keys) {
      if (!DEV_SCRIPT_RE.test(key)) continue;
      if (SKIP_SCRIPT_RE.test(key)) continue;
      const isThisNext = isNextJs && (key === "dev" || key === "start");
      out.push({
        key: opts ? `${opts.keyPrefix}-${key}` : key,
        name: opts ? `${opts.namePrefix} · ${scriptToName(key)}` : scriptToName(key),
        argv: [pm, "run", key],
        portMode: isThisNext ? "next" : "env",
        ...(opts ? { cwd: dir } : {}),
      });
    }
  } catch { /* ignore */ }
  return out;
}

/** Detect runnable dev commands for a project: a `.ao.json` `devCommands` override,
 *  else Flutter targets (root + apps/mobile/packages subfolders) and package.json
 *  dev scripts (root + bootstrapped subfolders, each with its own cwd). */
export function detectDevCommands(cwd: string): DetectedCommand[] {
  const aoPath = join(cwd, ".ao.json");
  if (existsSync(aoPath)) {
    try {
      const cfg = JSON.parse(readFileSync(aoPath, "utf8")) as { devCommands?: Array<{ name: string; cmd: string }> };
      if (Array.isArray(cfg.devCommands) && cfg.devCommands.length > 0) {
        return cfg.devCommands
          .filter((c) => typeof c.name === "string" && typeof c.cmd === "string")
          .map((c) => ({
            key: c.name.toLowerCase().replace(/\s+/g, "-"),
            name: c.name,
            argv: c.cmd.trim().split(/\s+/),
            portMode: "env" as const,
          }));
      }
    } catch { /* ignore */ }
  }

  const commands: DetectedCommand[] = [];

  // Flutter: root + common monorepo subfolders (apps/*, mobile/*, packages/*).
  const flutterCandidates: Array<{ dir: string; label: string }> = [{ dir: cwd, label: "Flutter Web" }];
  try {
    for (const parent of ["apps", "mobile", "packages"]) {
      const parentDir = join(cwd, parent);
      if (!existsSync(parentDir)) continue;
      for (const entry of readdirSync(parentDir, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;
        flutterCandidates.push({ dir: join(parentDir, entry.name), label: `Flutter - ${entry.name}` });
      }
    }
  } catch { /* ignore */ }

  for (const { dir, label } of flutterCandidates) {
    if (!existsSync(join(dir, "pubspec.yaml"))) continue;
    const key = dir === cwd ? "flutter" : `flutter-${dir.split("/").pop()}`;
    const isMobileApp = existsSync(join(dir, "android")) || existsSync(join(dir, "ios"));
    commands.push({
      key,
      name: label,
      argv: isMobileApp ? ["flutter", "run"] : ["flutter", "run", "-d", "web"],
      portMode: isMobileApp ? "device" : "flutter",
      cwd: dir,
    });
  }

  // package.json scripts — root, the bootstrapped subfolders, and (for real
  // pnpm/npm/yarn/bun monorepos) every package the workspace config declares,
  // so nested layouts like `apps/web` + `apps/desktop` aren't invisible just
  // because they don't match the bootstrapper's flat `frontend/`/`backend/`.
  commands.push(...collectPkgCommands(cwd));
  const rootPm = detectPackageManager(cwd);
  const workspaceDirs = new Set(resolveWorkspacePackageDirs(cwd));
  const subDirs = new Set<string>([...SUBFOLDERS.map((sub) => join(cwd, sub)), ...workspaceDirs]);
  for (const subDir of subDirs) {
    if (subDir === cwd || !existsSync(join(subDir, "package.json"))) continue;
    const rel = relative(cwd, subDir).split("/").pop()!;
    const label = rel.charAt(0).toUpperCase() + rel.slice(1);
    commands.push(...collectPkgCommands(subDir, {
      keyPrefix: relative(cwd, subDir).replace(/\//g, "-"),
      namePrefix: label,
      ...(workspaceDirs.has(subDir) ? { pmOverride: rootPm } : {}),
    }));
  }

  return commands;
}
