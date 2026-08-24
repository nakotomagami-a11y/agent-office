/**
 * Secrets service — reusable, per-project access tokens (Vercel, OpenAI, …).
 *
 * A secret is a free-form named env var: `name` is injected verbatim into a
 * run's environment (`env[name] = value`), so we own the raw value here (unlike
 * accounts.ts / github-accounts.ts, which point env vars at a CLI-owned config
 * dir). Stored once in `secrets`; the many-to-many `project_secrets` link lets
 * the same key be attached to multiple projects — "bring existing key to
 * another project" is a single `link()` call.
 *
 * Validity is proven, not trusted: a stored `expiresAt` is passive metadata
 * (badge only, never blocks). Real blocking comes from `testCmd` — an optional
 * user-supplied shell command run with the secret in env; exit 0 = valid. When
 * `verifyBeforeRun` is set, `verifyForProject` runs those checks before a spawn
 * and a fresh failure blocks that run (see runs.ts). Secrets with no testCmd
 * are "unknown" and never block.
 */

import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import type { Secret, SecretWithStatus } from "../../types/index";
import { getDb } from "../db";
import { log } from "../infra/log";
import { decryptSecret, encryptSecret } from "./secret-crypto";

interface SecretRow {
  id: string;
  name: string;
  label: string;
  value: string;
  expires_at: number | null;
  test_cmd: string | null;
  verify_before_run: number;
  last_tested_at: number | null;
  last_test_ok: number | null;
  created_at: number;
}

function rowToSecret(r: SecretRow): Secret {
  return {
    id: r.id,
    name: r.name,
    label: r.label,
    value: decryptSecret(r.value),
    expiresAt: r.expires_at,
    testCmd: r.test_cmd,
    verifyBeforeRun: r.verify_before_run === 1,
    lastTestedAt: r.last_tested_at,
    lastTestOk: r.last_test_ok === null ? null : r.last_test_ok === 1,
    createdAt: r.created_at,
  };
}

function toStatus(s: Secret, projectCount: number): SecretWithStatus {
  const { value: _value, ...rest } = s;
  return {
    ...rest,
    expired: s.expiresAt !== null && s.expiresAt < Date.now(),
    projectCount,
  };
}

const ENV_NAME_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

// ─── CRUD ─────────────────────────────────────────────────────────────────

export interface SecretInput {
  name: string;
  label?: string;
  value: string;
  expiresAt?: number | null;
  testCmd?: string | null;
  verifyBeforeRun?: boolean;
}

function normalizeName(name: string): string {
  const trimmed = name.trim();
  if (!ENV_NAME_RE.test(trimmed)) {
    throw new Error("name must be a valid env var (letters, digits, underscore; no leading digit)");
  }
  return trimmed;
}

export function get(id: string): Secret | null {
  const row = getDb().prepare("SELECT * FROM secrets WHERE id = ?").get(id) as SecretRow | undefined;
  return row ? rowToSecret(row) : null;
}

function projectCount(secretId: string): number {
  const r = getDb()
    .prepare("SELECT COUNT(*) AS n FROM project_secrets WHERE secret_id = ?")
    .get(secretId) as { n: number };
  return r.n;
}

export function list(): SecretWithStatus[] {
  const rows = getDb()
    .prepare("SELECT * FROM secrets ORDER BY created_at ASC")
    .all() as SecretRow[];
  return rows.map((r) => toStatus(rowToSecret(r), projectCount(r.id)));
}

export function create(input: SecretInput): SecretWithStatus {
  const name = normalizeName(input.name);
  const value = input.value;
  if (!value) throw new Error("value required");
  const id = `sec_${randomUUID().replace(/-/g, "").slice(0, 12)}`;
  const now = Date.now();
  getDb()
    .prepare(
      `INSERT INTO secrets (id, name, label, value, expires_at, test_cmd, verify_before_run, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      name,
      input.label?.trim() ?? "",
      encryptSecret(value),
      input.expiresAt ?? null,
      input.testCmd?.trim() || null,
      input.verifyBeforeRun ? 1 : 0,
      now,
    );
  log.info("secret.created", { id, name });
  return toStatus(get(id)!, 0);
}

export function update(id: string, input: Partial<SecretInput>): SecretWithStatus | null {
  const existing = get(id);
  if (!existing) return null;
  const name = input.name !== undefined ? normalizeName(input.name) : existing.name;
  const label = input.label !== undefined ? input.label.trim() : existing.label;
  const value = input.value !== undefined && input.value !== "" ? input.value : existing.value;
  const expiresAt = input.expiresAt !== undefined ? input.expiresAt : existing.expiresAt;
  const testCmd = input.testCmd !== undefined ? (input.testCmd?.trim() || null) : existing.testCmd;
  const verifyBeforeRun =
    input.verifyBeforeRun !== undefined ? input.verifyBeforeRun : existing.verifyBeforeRun;
  getDb()
    .prepare(
      `UPDATE secrets SET name = ?, label = ?, value = ?, expires_at = ?, test_cmd = ?, verify_before_run = ?
       WHERE id = ?`,
    )
    .run(name, label, encryptSecret(value), expiresAt ?? null, testCmd, verifyBeforeRun ? 1 : 0, id);
  log.info("secret.updated", { id });
  return toStatus(get(id)!, projectCount(id));
}

export function remove(id: string): boolean {
  const db = getDb();
  const existing = get(id);
  if (!existing) return false;
  db.transaction(() => {
    db.prepare("DELETE FROM project_secrets WHERE secret_id = ?").run(id);
    db.prepare("DELETE FROM secrets WHERE id = ?").run(id);
  })();
  log.info("secret.removed", { id });
  return true;
}

// ─── Project links ───────────────────────────────────────────────────────

export function link(projectId: string, secretId: string): boolean {
  if (!get(secretId)) return false;
  getDb()
    .prepare("INSERT OR IGNORE INTO project_secrets (project_id, secret_id, created_at) VALUES (?, ?, ?)")
    .run(projectId, secretId, Date.now());
  return true;
}

export function unlink(projectId: string, secretId: string): void {
  getDb()
    .prepare("DELETE FROM project_secrets WHERE project_id = ? AND secret_id = ?")
    .run(projectId, secretId);
}

/** Secrets attached to a project, read-path shape (no raw value). */
export function listForProject(projectId: string): SecretWithStatus[] {
  const rows = getDb()
    .prepare(
      `SELECT s.* FROM secrets s
       JOIN project_secrets ps ON ps.secret_id = s.id
       WHERE ps.project_id = ?
       ORDER BY s.created_at ASC`,
    )
    .all(projectId) as SecretRow[];
  return rows.map((r) => toStatus(rowToSecret(r), projectCount(r.id)));
}

/** Secrets attached to a project WITH raw values — for env injection only. */
export function listRawForProject(projectId: string): Secret[] {
  const rows = getDb()
    .prepare(
      `SELECT s.* FROM secrets s
       JOIN project_secrets ps ON ps.secret_id = s.id
       WHERE ps.project_id = ?`,
    )
    .all(projectId) as SecretRow[];
  return rows.map(rowToSecret);
}

// ─── Live validity ─────────────────────────────────────────────────────────

export interface TestResult {
  ok: boolean;
  output: string;
  /** true when the secret has no testCmd — nothing to run, status unchanged. */
  skipped?: boolean;
}

/**
 * Run a secret's testCmd with the secret in env (`sh -c`, 20s cap). Exit 0 =
 * valid. Persists last_tested_at + last_test_ok. A secret without a testCmd
 * returns `{ ok: true, skipped: true }` and is left "unknown".
 */
export function test(id: string): TestResult | null {
  const secret = get(id);
  if (!secret) return null;
  if (!secret.testCmd) return { ok: true, output: "", skipped: true };
  let ok = false;
  let output = "";
  try {
    output = execFileSync("sh", ["-c", secret.testCmd], {
      env: { ...process.env, [secret.name]: secret.value },
      timeout: 20_000,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    ok = true;
  } catch (err) {
    const e = err as { stdout?: string; stderr?: string; message?: string };
    output = (e.stdout ?? "") + (e.stderr ?? "") || e.message || "test command failed";
    ok = false;
  }
  getDb()
    .prepare("UPDATE secrets SET last_tested_at = ?, last_test_ok = ? WHERE id = ?")
    .run(Date.now(), ok ? 1 : 0, id);
  return { ok, output: output.slice(0, 4000) };
}

/**
 * Run verify-before-run checks for every secret linked to a project that has
 * `verifyBeforeRun` set + a testCmd. Returns the first failing secret's name +
 * output, or null if all pass / none to check. Called synchronously by
 * runs.startRun before spawning — a failure blocks that run.
 */
export function verifyForProject(projectId: string): { name: string; output: string } | null {
  for (const secret of listRawForProject(projectId)) {
    if (!secret.verifyBeforeRun || !secret.testCmd) continue;
    const result = test(secret.id);
    if (result && !result.ok) return { name: secret.name, output: result.output };
  }
  return null;
}
