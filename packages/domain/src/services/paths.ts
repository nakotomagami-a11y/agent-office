// Centralised on-disk paths. Keep these identical to the legacy server's
// values so existing user data still loads.

import { existsSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export const HOME = homedir();
export const CLAUDE_DIR = join(HOME, ".claude");
export const AGENTS_DIR = join(CLAUDE_DIR, "agents");
export const GLOBAL_MEMORY_PATH = join(AGENTS_DIR, "_global.memory.md");
export const PROJECTS_DIR = join(CLAUDE_DIR, "projects");
export const SKILLS_DIR = join(AGENTS_DIR, "_skills");
export const SETTINGS_FILE = join(CLAUDE_DIR, "agent-office-settings.json");

// New persistence root (only this app writes here).
export const APP_STATE_DIR = join(CLAUDE_DIR, "agent-office");
/**
 * @internal
 * Legacy path kept as a named export for backward compatibility only.
 * The one-time JSONL→SQLite migration in db.ts constructs this path locally
 * via `join(APP_STATE_DIR, "runs.log")` and does NOT import this export.
 * No active code imports this symbol.
 */
export const RUNS_LOG = join(APP_STATE_DIR, "runs.log");
/**
 * @internal
 * Legacy path kept as a named export for backward compatibility only.
 * The one-time JSONL→SQLite migration in db.ts constructs this path locally
 * via `join(APP_STATE_DIR, "recent-prompts.json")` and does NOT import this export.
 * No active code imports this symbol.
 */
export const PROMPTS_FILE = join(APP_STATE_DIR, "recent-prompts.json");
export const DB_PATH = join(APP_STATE_DIR, "db.sqlite");
export const DOCS_DIR = join(APP_STATE_DIR, "docs");
export const DOCS_GLOBAL_OWNER = "_global";

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
// `default` id maps to the system's own gh config (`~/.config/gh`) and is NEVER
// injected — a run with the default github account inherits whatever gh auth the
// machine has active, identical to pre-feature behavior.
export const GITHUB_ACCOUNTS_DIR = join(APP_STATE_DIR, "github-accounts");
export const DEFAULT_GITHUB_ACCOUNT_ID = "default";
export const SYSTEM_GH_CONFIG_DIR = join(HOME, ".config", "gh");

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

// Body size caps for text-payload routes (memory files, prompts).
export const MAX_MEMORY_BYTES = 256 * 1024;
export const MAX_PROMPT_BYTES = 100 * 1024;

export function agentUploadsDir(agentId: string): string {
  return join(AGENT_UPLOADS_DIR, agentId);
}

export function projectUploadsDir(projectId: string): string {
  return join(PROJECT_UPLOADS_ROOT, projectId, "_uploads");
}

export function safeFilename(name: string): string {
  return name.replace(/[/\\\0]+/g, "_").replace(/^\.+/, "").slice(0, 200) || "file";
}

// Strict validator for URL :id / :name segments that flow into path.join.
// Rejects path separators, traversal, leading dots, and oversized names -
// the route should respond 400 instead of silently transforming the value.
export function isValidIdSegment(name: string): boolean {
  if (typeof name !== "string") return false;
  if (name.length === 0 || name.length > 128) return false;
  if (name === "." || name === "..") return false;
  if (name.startsWith(".")) return false;
  return /^[A-Za-z0-9._-]+$/.test(name);
}

export function expandTilde(p: string): string {
  return p.replace(/^~(?=\/|$)/, HOME);
}

/**
 * Return an augmented PATH string that includes NVM node bin dirs and other
 * common locations so that `spawn("claude", ...)` works when the server
 * process inherits a minimal desktop-session environment (no .bashrc sourced).
 */
export function buildAugmentedPath(): string {
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

  const existing = process.env.PATH ?? "";
  const parts = [...extra, ...existing.split(":").filter(Boolean)];
  // Deduplicate while preserving order
  return [...new Set(parts)].join(":");
}
