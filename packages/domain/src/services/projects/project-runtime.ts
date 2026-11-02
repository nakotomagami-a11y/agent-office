// How a project is built and run, from what is on disk. In domain so the prompt
// assembler can reach it (RULE arch.domain-no-app-imports).

import { closeSync, constants, existsSync, fstatSync, lstatSync, openSync, readSync, readdirSync, realpathSync } from "node:fs";
import { basename, join, relative } from "node:path";
import type { DetectedCommand } from "../../types/index";
import { isInside } from "../infra/paths";
import { inert } from "./repo-text";

const MAX_REPO_FILE_BYTES = 256 * 1024;

/** The ONE door for repo-authored files; every flag is a crash a clone caused.
 *  `O_NOFOLLOW`: a `-> /dev/zero` symlink grows the read buffer until the
 *  allocator ABORTS, uncatchably. `O_NONBLOCK`: a FIFO blocks `openSync` and
 *  wedges the event loop on the project poll. Our own buffer: `readFileSync(fd)`
 *  re-stats, so it would allocate whatever the file grew to after the check. */
export function readRepoFile(path: string): string | undefined {
  let fd: number | undefined;
  try {
    fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    if (!fstatSync(fd).isFile()) return undefined;
    const buf = Buffer.allocUnsafe(MAX_REPO_FILE_BYTES + 1);
    let n = 0;
    while (n <= MAX_REPO_FILE_BYTES) {
      const read = readSync(fd, buf, n, MAX_REPO_FILE_BYTES + 1 - n, n);
      if (read === 0) break;
      n += read;
    }
    // Refuse rather than truncate: half a package.json is not a package.json.
    if (n > MAX_REPO_FILE_BYTES) return undefined;
    return buf.subarray(0, n).toString("utf8");
  } catch {
    return undefined;
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
}

/**
 * Read a JSON file as `unknown`. RULE arch.parse-dont-cast: these files are
 * user-editable (`package.json`, `.ao.json`) and have no obligation to match a
 * shape, so callers narrow with the guards below instead of asserting.
 */
function readJson(path: string): unknown {
  const raw = readRepoFile(path);
  if (raw === undefined) return undefined;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return undefined;
  }
}

function obj(v: unknown): Record<string, unknown> | undefined {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : undefined;
}

function str(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v : undefined;
}

/** `{ [name]: script }` entries whose values are strings; anything else dropped. */
function stringMap(v: unknown): Record<string, string> {
  const o = obj(v);
  if (!o) return {};
  const out: Record<string, string> = {};
  for (const [k, val] of Object.entries(o)) if (typeof val === "string") out[k] = val;
  return out;
}

function strArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}

/** Fallback layouts for projects with no real workspace config. */
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
  const pnpmYaml = readRepoFile(join(cwd, "pnpm-workspace.yaml"));
  if (pnpmYaml !== undefined) {
    const globs = parsePnpmWorkspaceGlobs(pnpmYaml);
    if (globs.length > 0) return globs;
  }

  const pkgPath = join(cwd, "package.json");
  try {
    if (existsSync(pkgPath)) {
      const w = obj(readJson(pkgPath))?.workspaces;
      const direct = strArray(w);
      if (direct.length > 0) return direct;
      const nested = strArray(obj(w)?.packages);
      if (nested.length > 0) return nested;
    }
  } catch { /* ignore */ }

  return [];
}

/** Resolve workspace globs to actual directories. Only supports a single
 *  trailing `*` segment (`apps/*`) or an exact path — covers the globs every
 *  real-world pnpm/npm/yarn/bun workspace we've seen actually uses. */
function resolveWorkspacePackageDirs(cwd: string): string[] {
  const dirs = new Set<string>();
  let realCwd: string;
  try {
    realCwd = realpathSync(cwd);
  } catch {
    return [];
  }
  // A REPO names these: `../..` walks out and a symlink resolves out, so BOTH
  // branches check — the unguarded one ran a foreign repo's script. `isInside`
  // is strictly below, so glob `*` (the root itself) needs the equality arm.
  const confined = (dir: string): boolean => {
    try {
      const real = realpathSync(dir);
      return real === realCwd || isInside(real, realCwd);
    } catch {
      return false;
    }
  };
  for (const glob of readWorkspaceGlobs(cwd)) {
    const clean = glob.replace(/\/$/, "");
    if (clean.includes("*")) {
      const prefix = clean.slice(0, clean.indexOf("*")).replace(/\/$/, "");
      const parentDir = join(cwd, prefix);
      if (!confined(parentDir)) continue;
      try {
        for (const entry of readdirSync(parentDir, { withFileTypes: true })) {
          if (entry.isDirectory()) dirs.add(join(parentDir, entry.name));
        }
      } catch { /* not a real dir, e.g. an unsupported deeper glob */ }
    } else if (confined(join(cwd, clean))) {
      dirs.add(join(cwd, clean));
    }
  }
  return [...dirs];
}

export interface RepoIdentity {
  name?: string;
  description?: string;
}

const IDENTITY_FILES = [".ao.json", "package.json"] as const;
const MAX_IDENTITY_NAME = 80;
const MAX_IDENTITY_DESCRIPTION = 160;

/** Same floor as the generated CLAUDE.md, because this lands in the system
 *  prompt of an agent holding Bash; `max` is instruction budget, so it is low. */
function identityText(v: unknown, max: number): string | undefined {
  const s = str(v);
  if (!s) return undefined;
  return inert(s, max) || undefined;
}

/** Cache stamp only; `readRepoFile` owns refusing what must not be read. */
function identityStamp(path: string): string {
  try {
    const st = lstatSync(path);
    return st.isFile() ? `${st.mtimeMs}:${st.size}` : "-";
  } catch {
    return "-";
  }
}

/** `size` joins `mtimeMs`: a same-millisecond rewrite shares an mtime. */
const identityCache = new Map<string, { stamp: string; identity: RepoIdentity }>();

/** What the repo says it is called, committed so every device reads one value.
 *  `.ao.json` first (a non-JS repo has nothing else), then `package.json`
 *  `displayName` — VS Code's spelling, npm `name` being a slug. Local wins. */
export function readRepoIdentity(cwd: string): RepoIdentity {
  const stamp = IDENTITY_FILES.map((f) => identityStamp(join(cwd, f))).join(",");
  const cached = identityCache.get(cwd);
  if (cached && cached.stamp === stamp) return cached.identity;

  const identity: RepoIdentity = {};
  for (const file of IDENTITY_FILES) {
    const parsed = obj(readJson(join(cwd, file)));
    if (!parsed) continue;
    const name = identityText(file === ".ao.json" ? parsed.name : parsed.displayName, MAX_IDENTITY_NAME);
    const description = identityText(parsed.description, MAX_IDENTITY_DESCRIPTION);
    if (name && !identity.name) identity.name = name;
    if (description && !identity.description) identity.description = description;
  }

  // Oldest out, not a full clear: projectsRoot can change mid-session.
  if (identityCache.size >= 500) identityCache.delete(identityCache.keys().next().value!);
  identityCache.set(cwd, { stamp, identity });
  return identity;
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
      const build = str(obj(readJson(aoPath))?.buildCommand);
      if (build) return build.trim().split(/\s+/);
    } catch { /* ignore */ }
  }

  const pkgPath = join(cwd, "package.json");
  if (existsSync(pkgPath)) {
    try {
      const scripts = stringMap(obj(readJson(pkgPath))?.scripts);
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
// Module-level set prevents two concurrent requests from picking the same port in
// the window between the "port is free" check and the process actually binding it.
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
    const pkg = obj(readJson(pkgPath));
    const allDeps = { ...stringMap(pkg?.dependencies), ...stringMap(pkg?.devDependencies) };
    const isNextJs = "next" in allDeps;
    const scripts = stringMap(pkg?.scripts);
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
 *  else package.json dev scripts (root + bootstrapped subfolders, each with its own cwd). */
export function detectDevCommands(cwd: string): DetectedCommand[] {
  const aoPath = join(cwd, ".ao.json");
  if (existsSync(aoPath)) {
    try {
      const raw = obj(readJson(aoPath))?.devCommands;
      const declared = Array.isArray(raw) ? raw : [];
      const commands = declared.flatMap((entry): DetectedCommand[] => {
        const e = obj(entry);
        const name = str(e?.name);
        const cmd = str(e?.cmd);
        if (!name || !cmd) return [];
        return [{
          key: name.toLowerCase().replace(/\s+/g, "-"),
          name,
          argv: cmd.trim().split(/\s+/),
          portMode: "env" as const,
        }];
      });
      if (commands.length > 0) return commands;
    } catch { /* ignore */ }
  }

  const commands: DetectedCommand[] = [];

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
    const rel = basename(subDir);
    const label = rel.charAt(0).toUpperCase() + rel.slice(1);
    commands.push(...collectPkgCommands(subDir, {
      keyPrefix: relative(cwd, subDir).replace(/[\\/]/g, "-"),
      namePrefix: label,
      ...(workspaceDirs.has(subDir) ? { pmOverride: rootPm } : {}),
    }));
  }

  return commands;
}
