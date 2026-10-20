/**
 * Accounts service — registry of Claude Code accounts agent-office can spawn
 * `claude` under. Each account owns a `CLAUDE_CONFIG_DIR` (see paths.ts).
 * The `default` account maps to `~/.claude` directly and is inserted by the
 * v8 migration when `~/.claude/.credentials.json` exists. All other accounts
 * live under `ACCOUNTS_DIR/<id>/` with a real `.credentials.json` (written by
 * the official `claude` CLI login flow) plus symlinks to shared assets in
 * `~/.claude/` — see `symlinkSharedAssets` for the exact contract.
 *
 * Slice 1: pure CRUD + symlink farming + plan/email detection. No API routes,
 * no UI, no spawn integration yet.
 */

import {
  existsSync, linkSync, lstatSync, mkdirSync, readdirSync, readFileSync, renameSync, rmdirSync, rmSync, statSync, symlinkSync,
  unlinkSync,
} from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import type { Account, AccountWithStatus, ClaudePlan } from "../../types/index";
import {
  ACCOUNTS_DIR,
  CLAUDE_DIR,
  DEFAULT_ACCOUNT_ID,
  PROJECTS_DIR,
  accountConfigDir,
  isInside,
  isValidIdSegment,
} from "../infra/paths";
import { getDb, isPidAlive } from "../db";
import { log } from "../infra/log";

// Assets we symlink into every non-default account dir so agents/skills/etc.
// are shared across accounts (billing is the ONLY thing that differs per
// account — Q3 decision, see .specs/tasks/task-multi-account-5.md).
const SHARED_ASSETS = [
  "agents",
  "skills",
  "settings.json",
  "CLAUDE.md",
  "projects",
  "commands",
  "plugins",
] as const;

// ─── CRUD ───────────────────────────────────────────────────────────────────

interface AccountRow {
  id: string;
  label: string;
  config_dir: string;
  created_at: number;
}

function rowToAccount(row: AccountRow): Account {
  return { id: row.id, label: row.label, configDir: row.config_dir, createdAt: row.created_at };
}

export function list(): Account[] {
  const rows = getDb()
    .prepare("SELECT id, label, config_dir, created_at FROM accounts ORDER BY created_at ASC")
    .all() as AccountRow[];
  return rows.map(rowToAccount);
}

export function get(id: string): Account | null {
  const row = getDb()
    .prepare("SELECT id, label, config_dir, created_at FROM accounts WHERE id = ?")
    .get(id) as AccountRow | undefined;
  return row ? rowToAccount(row) : null;
}

export function create(input: { label: string }): Account {
  const label = input.label.trim();
  if (!label) throw new Error("label required");
  const id = `acc_${randomUUID().replace(/-/g, "").slice(0, 12)}`;
  const configDir = accountConfigDir(id);
  ensureAccountDir(id);
  const now = Date.now();
  getDb()
    .prepare(
      "INSERT INTO accounts (id, label, config_dir, created_at) VALUES (?, ?, ?, ?)",
    )
    .run(id, label, configDir, now);
  log.info("account.created", { id, label });
  return { id, label, configDir, createdAt: now };
}

export function rename(id: string, label: string): Account {
  const trimmed = label.trim();
  if (!trimmed) throw new Error("label required");
  const existing = get(id);
  if (!existing) throw new Error(`account '${id}' not found`);
  getDb().prepare("UPDATE accounts SET label = ? WHERE id = ?").run(trimmed, id);
  log.info("account.renamed", { id, label: trimmed });
  return { ...existing, label: trimmed };
}

export interface RemoveResult {
  ok: boolean;
  blocked?: string[];
  reason?: "default" | "not_found" | "referenced";
}

export function remove(id: string): RemoveResult {
  if (id === DEFAULT_ACCOUNT_ID) return { ok: false, reason: "default" };
  const existing = get(id);
  if (!existing) return { ok: false, reason: "not_found" };
  const blockers = findProjectsUsingAccount(id);
  if (blockers.length > 0) return { ok: false, reason: "referenced", blocked: blockers };

  getDb().prepare("DELETE FROM accounts WHERE id = ?").run(id);
  // Only touch dirs under ACCOUNTS_DIR — never ~/.claude root.
  const dir = accountConfigDir(id);
  if (isInside(dir, ACCOUNTS_DIR) && existsSync(dir)) {
    rmSync(dir, { recursive: true, force: true });
  }
  log.info("account.removed", { id });
  return { ok: true };
}

// ─── Directory + symlink farming ────────────────────────────────────────────

/**
 * Idempotent. Creates `<ACCOUNTS_DIR>/<id>/` and symlinks each shared asset
 * from `~/.claude/*` into it, skipping assets that don't exist in the source
 * and links that already exist. `.credentials.json` is intentionally NOT
 * symlinked — the account's own credentials will be written there by
 * `claude login` (slice 3).
 */
export function ensureAccountDir(id: string): string {
  if (id === DEFAULT_ACCOUNT_ID) return CLAUDE_DIR;
  if (!isValidIdSegment(id)) throw new Error(`invalid account id: ${id}`);
  const dir = accountConfigDir(id);
  mkdirSync(dir, { recursive: true });
  symlinkSharedAssets(id);
  return dir;
}

export function symlinkSharedAssets(id: string): void {
  if (id === DEFAULT_ACCOUNT_ID) return;
  const dir = accountConfigDir(id);
  for (const asset of SHARED_ASSETS) {
    const source = join(CLAUDE_DIR, asset);
    if (!existsSync(source)) continue;
    const target = join(dir, asset);
    let existing: ReturnType<typeof lstatSync> | undefined;
    try {
      existing = lstatSync(target);
    } catch {
      // ENOENT — good, path is free.
    }
    if (existing && asset === "projects" && existing.isDirectory() && !existing.isSymbolicLink()) {
      if (!absorbProjectsDir(id, target, source)) continue;
      existing = undefined;
    }
    // Anything else already at that path is left alone — never clobber.
    if (existing) continue;
    try {
      linkAsset(source, target, statSync(source).isDirectory());
    } catch (err) {
      log.warn("account.symlink_failed", { id, asset, err: String(err) });
    }
  }
}

/** Windows refuses symlinks without Developer Mode (EPERM), which left accounts
 *  with no shared assets at all. A junction needs no privilege. Files get no
 *  fallback: a hard link silently goes stale on the first atomic save. */
function linkAsset(source: string, target: string, isDir: boolean): void {
  if (process.platform !== "win32") return symlinkSync(source, target);
  symlinkSync(source, target, isDir ? "junction" : "file");
}

/**
 * A real `projects/` dir (the CLI made one where the link failed) hides every
 * session the other accounts wrote, so `--resume` dies after an account switch.
 * Merge its sessions into the shared dir — never overwriting one — then drop it.
 * Returns false when it must stay for now (live writer, failed link).
 */
function absorbProjectsDir(id: string, dir: string, shared: string): boolean {
  // A live CLI of this account appends to its session file by path: moving it
  // now would split the transcript. A later spawn finishes the job.
  if (accountHasLiveRun(id)) return deferMerge(id, "live_run");
  // Phase 1 only adds hard links, so a deferred merge leaves every session
  // visible from both sides — an append through either path hits one inode.
  const scan = newScan();
  linkInto(dir, shared, scan);
  if (scan.crossDevice) return deferMerge(id, "cross_device");
  if (scan.failures > 0) return deferMerge(id, "link_failed");
  // No runs row covers `claude` in an Agent Office terminal under this account.
  if (scan.recent) return deferMerge(id, "recently_written");
  // Phase 2: drop only sources verified to be the very file now in `shared`.
  if (pruneLinked(dir, shared) > 0) return deferMerge(id, "prune_failed");
  try {
    rmdirSync(dir);
    return true;
  } catch {
    // Only same-named conflicts remain (a project's own memory files, say): keep them aside.
  }
  const aside = `${dir}.unmerged-${Date.now()}`;
  try {
    renameSync(dir, aside);
  } catch (err) {
    return deferMerge(id, `aside_failed: ${String(err)}`);
  }
  log.warn("account.projects_unmerged", { id, kept: aside });
  return true;
}

function accountHasLiveRun(id: string): boolean {
  const rows = getDb()
    .prepare("SELECT owner_pid FROM runs WHERE status = 'running' AND account_id = ?")
    .all(id) as Array<{ owner_pid: number | null }>;
  return rows.some((r) => isPidAlive(r.owner_pid));
}

const deferredLogged = new Set<string>();

function deferMerge(id: string, reason: string): false {
  if (!deferredLogged.has(id + reason)) log.warn("account.projects_merge_deferred", { id, reason });
  deferredLogged.add(id + reason);
  return false;
}

const RECENT_WRITE_MS = 10 * 60_000;

interface LinkScan { conflicts: number; failures: number; crossDevice: boolean; recent: boolean; now: number }

function newScan(): LinkScan {
  return { conflicts: 0, failures: 0, crossDevice: false, recent: false, now: Date.now() };
}

/** Hard-link every file of `from` into `to`, never replacing a name already
 *  there (link fails with EEXIST). Unlinks nothing. */
function linkInto(from: string, to: string, scan: LinkScan): void {
  let names: string[];
  try {
    names = readdirSync(from);
  } catch {
    scan.failures++;
    return;
  }
  for (const name of names) {
    const src = join(from, name);
    const dst = join(to, name);
    try {
      const st = lstatSync(src);
      if (st.isDirectory()) {
        if (ensureDir(dst)) linkInto(src, dst, scan);
        else scan.conflicts++;
      } else if (st.isFile()) {
        if (scan.now - st.mtimeMs < RECENT_WRITE_MS) scan.recent = true;
        linkFile(src, dst, scan);
      } else {
        scan.conflicts++;
      }
    } catch {
      scan.failures++;
    }
  }
}

/** True when `dst` is (now) a real directory. */
function ensureDir(dst: string): boolean {
  try {
    mkdirSync(dst);
    return true;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "EEXIST") throw err;
    const st = lstatSync(dst);
    return st.isDirectory() && !st.isSymbolicLink();
  }
}

function linkFile(src: string, dst: string, scan: LinkScan): void {
  try {
    linkSync(src, dst);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "EXDEV") scan.crossDevice = true;
    else if (code !== "EEXIST") scan.failures++;
    else if (!sameFile(src, dst)) scan.conflicts++;
  }
}

/** Same file, not merely an equal number: Windows file ids exceed 2^53, so a
 *  plain `ino` loses its low bits and two different files can compare equal. */
function sameFile(a: string, b: string): boolean {
  const x = statSync(a, { bigint: true });
  const y = statSync(b, { bigint: true });
  return x.ino === y.ino && x.dev === y.dev && x.nlink >= 2n;
}

/** Unlink every file of `from` that is the very file in `to`; returns how many
 *  such files could not be unlinked (locked). Conflicts simply stay. */
function pruneLinked(from: string, to: string): number {
  let failed = 0;
  for (const name of readdirSync(from)) {
    const src = join(from, name);
    const dst = join(to, name);
    if (lstatSync(src).isDirectory()) {
      failed += pruneLinked(src, dst);
      try {
        rmdirSync(src);
      } catch {
        // Not empty: a conflict stays.
      }
    } else if (existsSync(dst) && sameFile(src, dst)) {
      try {
        unlinkSync(src);
      } catch {
        failed++;
      }
    }
  }
  return failed;
}

// ─── Plan + email detection ─────────────────────────────────────────────────

interface CredentialsBlob {
  claudeAiOauth?: {
    subscriptionType?: string;
    emailAddress?: string;
    accountEmail?: string;
    email?: string;
    /** Epoch ms the access token expires. */
    expiresAt?: number;
    /** Present when the session can be renewed without a fresh login. */
    refreshToken?: string;
  };
}

function readCredentials(configDir: string): CredentialsBlob | null {
  const path = join(configDir, ".credentials.json");
  try {
    return JSON.parse(readFileSync(path, "utf-8")) as CredentialsBlob;
  } catch {
    return null;
  }
}

export function getPlan(id: string): ClaudePlan {
  const account = get(id);
  if (!account) return "free";
  const creds = readCredentials(account.configDir);
  const sub = creds?.claudeAiOauth?.subscriptionType?.toLowerCase() ?? "";
  if (sub === "max" || sub.startsWith("max")) return "max";
  if (sub === "pro") return "pro";
  if (sub === "free") return "free";
  if (sub === "api" || sub === "api_key") return "api";
  return "free";
}

export function getEmail(id: string): string | null {
  const account = get(id);
  if (!account) return null;
  const creds = readCredentials(account.configDir);
  const o = creds?.claudeAiOauth;
  return o?.emailAddress ?? o?.accountEmail ?? o?.email ?? null;
}

export function isReady(id: string): boolean {
  const account = get(id);
  if (!account) return false;
  if (!existsSync(join(account.configDir, ".credentials.json"))) return false;
  // File existence alone is not enough: a session whose access token has
  // expired AND has no refresh token is dead — the CLI fails with "OAuth
  // session expired and could not be refreshed". Treat that as not-ready so
  // the UI shows "needs login" + Sign in. Anything still valid or refreshable
  // counts as ready.
  const o = readCredentials(account.configDir)?.claudeAiOauth;
  if (!o) return false;
  if (typeof o.expiresAt === "number" && o.expiresAt <= Date.now() && !o.refreshToken) {
    return false;
  }
  return true;
}

export function getStatus(id: string): AccountWithStatus | null {
  const account = get(id);
  if (!account) return null;
  const ready = isReady(id);
  const status: AccountWithStatus = {
    ...account,
    plan: ready ? getPlan(id) : "free",
    ready,
  };
  const email = getEmail(id);
  if (email) status.email = email;
  return status;
}

// ─── Referential integrity ──────────────────────────────────────────────────

/**
 * Scan `~/.claude/projects/*​/project.md` for any project whose YAML
 * frontmatter references the given accountId. Used by `remove()` to block
 * deletion when referenced (Q8 decision — no null-out fallback).
 *
 * Cheap regex parse — we only need to detect the accountId line, not
 * fully parse YAML. If a project's frontmatter format ever changes, the
 * regex simply misses and remove goes through anyway; the run-time
 * spawn integration in slice 2 will treat a stale-accountId project as
 * NULL (fall back to default), so this is fail-safe.
 */
function findProjectsUsingAccount(accountId: string): string[] {
  if (!existsSync(PROJECTS_DIR)) return [];
  const out: string[] = [];
  let entries: string[] = [];
  try {
    entries = readdirSync(PROJECTS_DIR);
  } catch {
    return [];
  }
  for (const entry of entries) {
    const projectMd = join(PROJECTS_DIR, entry, "project.md");
    if (!existsSync(projectMd)) continue;
    try {
      const raw = readFileSync(projectMd, "utf-8");
      // Match `accountId: <id>` in the frontmatter (before the closing ---).
      const fm = raw.match(/^---\n([\s\S]*?)\n---/);
      if (!fm) continue;
      const pattern = new RegExp(`^accountId:\\s*["']?${accountId}["']?\\s*$`, "m");
      if (pattern.test(fm[1]!)) out.push(entry);
    } catch {
      // Unreadable — skip. Better to allow delete than block on garbled data.
    }
  }
  return out;
}
