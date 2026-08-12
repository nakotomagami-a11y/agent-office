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

import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, symlinkSync, lstatSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import type { Account, AccountWithStatus, ClaudePlan } from "../types/index";
import {
  ACCOUNTS_DIR,
  CLAUDE_DIR,
  DEFAULT_ACCOUNT_ID,
  PROJECTS_DIR,
  accountConfigDir,
  isValidIdSegment,
} from "./paths";
import { getDb } from "./db";
import { log } from "./log";

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
  if (dir.startsWith(ACCOUNTS_DIR + "/") && existsSync(dir)) {
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
    // Skip if a link (or anything) is already at that path — never clobber.
    let alreadyExists = false;
    try {
      lstatSync(target);
      alreadyExists = true;
    } catch {
      // ENOENT — good, path is free.
    }
    if (alreadyExists) continue;
    try {
      symlinkSync(source, target);
    } catch (err) {
      log.warn("account.symlink_failed", { id, asset, err: String(err) });
    }
  }
}

// ─── Plan + email detection ─────────────────────────────────────────────────

interface CredentialsBlob {
  claudeAiOauth?: {
    subscriptionType?: string;
    emailAddress?: string;
    accountEmail?: string;
    email?: string;
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
  return existsSync(join(account.configDir, ".credentials.json"));
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
