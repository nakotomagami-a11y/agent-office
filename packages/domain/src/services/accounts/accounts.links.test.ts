/**
 * An account dir whose `projects` link failed (Windows: EPERM without Developer
 * Mode) got a real `projects/` from the CLI instead. Sessions written under one
 * account were then invisible to the other, so every `--resume` after an
 * account switch died with "No conversation found with session ID".
 *
 *   pnpm --filter @agent-office/domain test src/services/accounts/accounts.links.test.ts
 */
import assert from "node:assert";
import { test } from "node:test";
import { chmodSync, existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, utimesSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import Database from "better-sqlite3";
import { createSchema } from "../db/migrations";
import { insertRun } from "../db/runs";
import { symlinkSharedAssets } from "./accounts";
import { CLAUDE_DIR, accountConfigDir } from "../infra/paths";

const mem = new Database(":memory:");
createSchema(mem);
globalThis.__agentOfficeDb = mem;

const shared = join(CLAUDE_DIR, "projects");

const HOUR_AGO = new Date(Date.now() - 3_600_000);

/** Written an hour ago, unless `fresh`: a file touched in the last minutes may have a live writer. */
function put(path: string, body = "x", fresh = false): void {
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(path, body);
  if (!fresh) utimesSync(path, HOUR_AGO, HOUR_AGO);
}

function asides(accountDir: string): string[] {
  return readdirSync(accountDir).filter((n) => n.startsWith("projects.unmerged-"));
}

test("a real projects dir is merged into the shared one and replaced by a link", () => {
  const own = join(accountConfigDir("acc_links1"), "projects");
  put(join(shared, "C--repo", "s1.jsonl"), "shared");
  put(join(own, "C--repo", "s2.jsonl"), "own");
  put(join(own, "C--other", "s3.jsonl"), "other");

  symlinkSharedAssets("acc_links1");

  assert.ok(lstatSync(own).isSymbolicLink(), "projects must now be a link to the shared dir");
  assert.deepEqual(readdirSync(join(own, "C--repo")).sort(), ["s1.jsonl", "s2.jsonl"]);
  assert.equal(readFileSync(join(shared, "C--other", "s3.jsonl"), "utf8"), "other");

  symlinkSharedAssets("acc_links1");
  assert.deepEqual(asides(accountConfigDir("acc_links1")), [], "a second pass is a no-op");
});

test("a same-named file is never overwritten: the leftover dir is kept aside", () => {
  const accountDir = accountConfigDir("acc_links2");
  put(join(shared, "C--clash", "MEMORY.md"), "shared copy");
  put(join(accountDir, "projects", "C--clash", "MEMORY.md"), "account copy");

  symlinkSharedAssets("acc_links2");

  assert.equal(readFileSync(join(shared, "C--clash", "MEMORY.md"), "utf8"), "shared copy");
  const [aside] = asides(accountDir);
  assert.ok(aside, "the conflicting dir must be kept, not deleted");
  assert.equal(readFileSync(join(accountDir, aside, "C--clash", "MEMORY.md"), "utf8"), "account copy");
  assert.ok(lstatSync(join(accountDir, "projects")).isSymbolicLink());
});

test("nothing moves while a run of that account is live — its CLI is appending", () => {
  const own = join(accountConfigDir("acc_links3"), "projects");
  put(join(own, "C--live", "busy.jsonl"), "in use");
  insertRun({ id: "live1", agentId: "dev", agentName: "Dev", status: "running", prompt: "p", model: "", effort: "", startedAt: 1, accountId: "acc_links3" });

  symlinkSharedAssets("acc_links3");

  assert.ok(!lstatSync(own).isSymbolicLink());
  assert.equal(readFileSync(join(own, "C--live", "busy.jsonl"), "utf8"), "in use");
  assert.ok(!existsSync(join(shared, "C--live")));
});

test("a file written minutes ago (claude in a terminal has no run row) defers the merge", () => {
  const own = join(accountConfigDir("acc_links6"), "projects");
  put(join(own, "C--term", "old.jsonl"));
  put(join(own, "C--term", "now.jsonl"), "appending", true);

  symlinkSharedAssets("acc_links6");

  assert.ok(!lstatSync(own).isSymbolicLink());
  assert.equal(readFileSync(join(own, "C--term", "now.jsonl"), "utf8"), "appending");
  // Deferred, but already visible from the shared side — same file, not a copy.
  assert.equal(readFileSync(join(shared, "C--term", "old.jsonl"), "utf8"), "x");
});

// Root ignores the mode bits this test relies on.
const cannotLock = process.platform === "win32" || process.getuid?.() === 0;

test("a link that fails defers the merge instead of hiding files aside", { skip: cannotLock }, () => {
  const accountDir = accountConfigDir("acc_links4");
  const locked = join(accountDir, "projects", "C--locked");
  put(join(locked, "s.jsonl"), "keep");
  chmodSync(locked, 0o000); // unreadable: nothing in it can be linked into shared
  try {
    symlinkSharedAssets("acc_links4");
  } finally {
    chmodSync(locked, 0o700);
  }

  assert.ok(!lstatSync(join(accountDir, "projects")).isSymbolicLink());
  assert.deepEqual(asides(accountDir), []);
  assert.equal(readFileSync(join(locked, "s.jsonl"), "utf8"), "keep");

  symlinkSharedAssets("acc_links4");
  assert.ok(lstatSync(join(accountDir, "projects")).isSymbolicLink(), "the next pass finishes the move");
  assert.equal(readFileSync(join(shared, "C--locked", "s.jsonl"), "utf8"), "keep");
});

test("other assets already present are left alone", () => {
  const accountDir = accountConfigDir("acc_links5");
  put(join(CLAUDE_DIR, "skills", "a", "SKILL.md"));
  put(join(accountDir, "skills", "own", "SKILL.md"));

  symlinkSharedAssets("acc_links5");

  assert.ok(!lstatSync(join(accountDir, "skills")).isSymbolicLink());
  assert.ok(existsSync(join(accountDir, "skills", "own", "SKILL.md")));
});
