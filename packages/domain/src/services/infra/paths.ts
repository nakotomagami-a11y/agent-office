// Centralised on-disk paths. Keep these identical to the legacy server's
// values so existing user data still loads.

import { existsSync, readdirSync, realpathSync } from "node:fs";
import { homedir, platform, userInfo } from "node:os";
import { basename, delimiter, dirname, join, posix, sep, win32 } from "node:path";
import { fileURLToPath } from "node:url";
import { absoluteSearchPath } from "./search-path";

export const HOME = homedir();

type PathApi = typeof posix;
const nativePath: PathApi = sep === "\\" ? win32 : posix;

/**
 * The one spelling of a path that every comparison uses. Symlinks are resolved: git prints a
 * worktree's real path (`C:/x` for `C:\x`, macOS `/var` as `/private/var`, Windows 8.3 short
 * names expanded), and a delete guard must judge where a path really leads, not how it is spelled.
 * A path that does not exist resolves through its deepest existing ancestor, so a missing child
 * still sits inside its resolved parent. Windows compares case-insensitively. `pathApi` is a
 * parameter so tests can pin `path.win32`; only the native one reads the disk.
 * `"lexical"` skips the disk, for a bound that only limits what is READ: a Documents folder
 * moved to another drive by a junction is still the user's Documents.
 */
export function pathKey(p: string, pathApi: PathApi = nativePath, links: Links = "follow"): string {
  const abs = pathApi.resolve(p);
  const real = pathApi === nativePath && links === "follow" ? realpathOfDeepest(abs) : abs;
  return pathApi.sep === "\\" ? real.toLowerCase() : real;
}

function realpathOfDeepest(abs: string): string {
  const missing: string[] = [];
  for (let cur = abs; ; ) {
    try {
      return join(realpathSync.native(cur), ...missing.reverse());
    } catch {
      const parent = dirname(cur);
      if (parent === cur) return abs;
      missing.push(basename(cur));
      cur = parent;
    }
  }
}

type Links = "follow" | "lexical";

export function samePath(a: string, b: string, pathApi: PathApi = nativePath, links: Links = "follow"): boolean {
  return pathKey(a, pathApi, links) === pathKey(b, pathApi, links);
}

/** `child` is strictly below `parent`. Never `startsWith(parent + "/")`: that refused every
 *  Windows path and every mixed-separator one, so guarded deletes silently did nothing. */
export function isInside(child: string, parent: string, pathApi: PathApi = nativePath, links: Links = "follow"): boolean {
  const rel = pathApi.relative(pathKey(parent, pathApi, links), pathKey(child, pathApi, links));
  return rel !== "" && rel !== ".." && !rel.startsWith(".." + pathApi.sep) && !pathApi.isAbsolute(rel);
}

// A test that resolves the real profile can delete real user data (it did, on
// Windows, where HOME is ignored and USERPROFILE wins). Fail before any path is used.
// userInfo() reads the OS account, so env overrides cannot fool it. NODE_TEST_CONTEXT
// is unset when a test file is run directly (`tsx x.test.ts`), hence the argv check.
function realAccountHome(): string | null {
  try {
    return userInfo().homedir;
  } catch {
    return null;
  }
}
const underTest =
  !!process.env.NODE_TEST_CONTEXT ||
  process.execArgv.includes("--test") ||
  /\.test\.[cm]?[jt]sx?$/.test(process.argv[1] ?? "");
const accountHome = underTest ? realAccountHome() : null;
if (accountHome !== null && samePath(HOME, accountHome)) {
  throw new Error(
    "test_uses_real_home: tests must not touch the real ~/.claude. Run them through `pnpm test` " +
      "(scripts/run-tests.mjs), or set both HOME and USERPROFILE to a temp dir before importing.",
  );
}
export const CLAUDE_DIR = join(HOME, ".claude");
export const AGENTS_DIR = join(CLAUDE_DIR, "agents");
export const GLOBAL_MEMORY_PATH = join(AGENTS_DIR, "_global.memory.md");
export const PROJECTS_DIR = join(CLAUDE_DIR, "projects");
export const SKILLS_DIR = join(AGENTS_DIR, "_skills");
export const SETTINGS_FILE = join(CLAUDE_DIR, "agent-office-settings.json");

/** Repo `scripts/`. Two traps, both already shipped as bugs: hops must go
 *  through `join`, never `new URL(...)` (bundlers resolve that as a module),
 *  and module-relative resolution holds only in `next dev` — the packaged app
 *  webpacks this into `.next`, so the launcher passes the root explicitly. */
export const REPO_SCRIPTS_DIR = process.env.AO_BUNDLE_ROOT
  ? join(process.env.AO_BUNDLE_ROOT, "scripts")
  : join(
      dirname(fileURLToPath(import.meta.url)),
      "..", "..", "..", "..", "..",
      "scripts",
    );

/** Repo `docs/`. Same trap as REPO_SCRIPTS_DIR: the module-relative hops
 *  happen to land correctly in BOTH layouts today, which is a coincidence, not
 *  a guarantee. The launcher-supplied root is the reliable one. */
export const REPO_DOCS_DIR = process.env.AO_BUNDLE_ROOT
  ? join(process.env.AO_BUNDLE_ROOT, "docs")
  : join(
      dirname(fileURLToPath(import.meta.url)),
      "..", "..", "..", "..", "..",
      "docs",
    );

// New persistence root (only this app writes here).
export const APP_STATE_DIR = join(CLAUDE_DIR, "agent-office");
export const DB_PATH = join(APP_STATE_DIR, "db.sqlite");
/** Data a migration removes is written here first. */
export const BACKUPS_DIR = join(APP_STATE_DIR, "backups");
/** Never under AGENTS_DIR: the CLI loads every .md beneath it, a backup included, as an agent (C1). */
export const AGENT_BACKUPS_DIR = join(BACKUPS_DIR, "agents");
/** A project's state as it was before a save file was imported over it. */
export const IMPORT_BACKUPS_DIR = join(BACKUPS_DIR, "imports");
/** Per-run files handed to the CLI by path: appended system prompts and `--settings` pins. */
export const TMP_PROMPTS_DIR = join(APP_STATE_DIR, "tmp-prompts");
export const DOCS_DIR = join(APP_STATE_DIR, "docs");
export const PRICE_CATALOG_FILE = join(APP_STATE_DIR, "price-catalog.json");
export const DOCS_GLOBAL_OWNER = "_global";
// Where local clients (the Minecraft mod) find running servers: one <pid>.json each (random ports).
export const DISCOVERY_DIR = join(APP_STATE_DIR, "servers");

// Multi-account: per-account CLAUDE_CONFIG_DIR roots. The `default` account
// id has no dir under here — it maps to CLAUDE_DIR directly.
export const ACCOUNTS_DIR = join(APP_STATE_DIR, "accounts");
export const DEFAULT_ACCOUNT_ID = "default";

/**
 * Config dir Claude CLI reads for a given account id. `default` returns the
 * shared `~/.claude`; every other id returns its own dir under ACCOUNTS_DIR.
 */
export function accountConfigDir(id: string): string {
  return id === DEFAULT_ACCOUNT_ID ? CLAUDE_DIR : join(ACCOUNTS_DIR, id);
}

// Per-project GitHub account: each non-default account owns a GH_CONFIG_DIR
// (the dir `gh` reads its hosts.yml/token from) under GITHUB_ACCOUNTS_DIR. The
// `default` id maps to the system's own gh config and is NEVER injected — a run
// with the default github account inherits whatever gh auth the machine has
// active, identical to pre-feature behavior.
export const GITHUB_ACCOUNTS_DIR = join(APP_STATE_DIR, "github-accounts");
export const DEFAULT_GITHUB_ACCOUNT_ID = "default";
// gh's own lookup order. On Windows that is %APPDATA%\GitHub CLI, not ~/.config/gh —
// reading the latter showed a signed-in default account as "needs login".
export function ghConfigDir(env: NodeJS.ProcessEnv, os: NodeJS.Platform, home: string): string {
  return (
    env.GH_CONFIG_DIR ||
    (env.XDG_CONFIG_HOME && join(env.XDG_CONFIG_HOME, "gh")) ||
    (os === "win32" && env.APPDATA && join(env.APPDATA, "GitHub CLI")) ||
    join(home, ".config", "gh")
  );
}
export const SYSTEM_GH_CONFIG_DIR = ghConfigDir(process.env, platform(), HOME);

/**
 * GH_CONFIG_DIR for a given github account id, or `null` for `default`/unset —
 * `null` signals "don't inject; inherit the system gh auth". Every non-default
 * id returns its own dir under GITHUB_ACCOUNTS_DIR.
 */
export function githubAccountConfigDir(id: string): string | null {
  return id === DEFAULT_GITHUB_ACCOUNT_ID ? null : join(GITHUB_ACCOUNTS_DIR, id);
}

// Uploads
export const AGENT_UPLOADS_DIR = join(AGENTS_DIR, "_uploads");
export const PROJECT_UPLOADS_ROOT = PROJECTS_DIR; // per-project: <root>/<id>/_uploads
export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;

// Written by the external `imggen` CLI as <root>/YYYY-MM-DD/<file>; this app only reads it.
export const GENERATED_IMAGES_DIR = join(HOME, "Documents", "Generated Images");

export function agentUploadsDir(agentId: string): string {
  return join(AGENT_UPLOADS_DIR, agentId);
}

export function projectUploadsDir(projectId: string): string {
  return join(PROJECT_UPLOADS_ROOT, projectId, "_uploads");
}

export function safeFilename(name: string): string {
  return name.replace(/[/\\\0]+/g, "_").replace(/^\.+/, "").slice(0, 200) || "file";
}

// Re-exported so the ~40 existing call sites keep importing it from here; the
// definition moved to config/ so api-contract can share it (see that file).
export { isValidIdSegment } from "../../config/id-segment";

/** `~`, `~/x` and, on Windows, `~\x`; the result uses the platform's separators throughout. */
export function expandTilde(p: string, home: string = HOME, pathApi: PathApi = nativePath): string {
  const tilde = pathApi.sep === "\\" ? /^~(?=[\\/]|$)/ : /^~(?=\/|$)/;
  return tilde.test(p) ? pathApi.join(home, p.slice(1)) : p;
}

/**
 * Return an augmented PATH string that includes NVM node bin dirs and other
 * common locations so that spawning `claude` works when the server
 * process inherits a minimal desktop-session environment (no .bashrc sourced).
 * POSIX only: splitting a Windows PATH on `:` mangles every drive letter.
 */
export function buildAugmentedPath(): string {
  const existing = process.env.PATH ?? process.env.Path ?? "";
  if (platform() === "win32") {
    // Windows' inherited PATH already has the global npm bin dir.
    return absoluteSearchPath(existing, "win32");
  }

  const extra: string[] = [];

  // NVM - add every installed node version's bin dir (newest first via reverse sort)
  const nvmVersionsDir = join(HOME, ".nvm", "versions", "node");
  if (existsSync(nvmVersionsDir)) {
    try {
      const versions = readdirSync(nvmVersionsDir).sort().reverse();
      for (const v of versions) {
        extra.push(join(nvmVersionsDir, v, "bin"));
      }
    } catch {
      // ignore read errors
    }
  }

  // Other common global bin locations
  extra.push(join(HOME, ".local", "bin"));
  extra.push("/usr/local/bin");
  extra.push("/usr/bin");
  extra.push("/bin");

  const parts = [...extra, ...existing.split(delimiter).filter(Boolean)];
  // Deduplicate while preserving order
  return absoluteSearchPath([...new Set(parts)].join(delimiter), platform());
}
