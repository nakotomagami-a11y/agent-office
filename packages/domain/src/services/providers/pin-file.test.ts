/**
 *   pnpm --filter @agent-office/domain test src/services/providers/pin-file.test.ts
 */
import assert from "node:assert";
import { test } from "node:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, statSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
import { join } from "node:path";

const sandbox = mkdtempSync(join(tmpdir(), "ao-pin-file-"));
process.env.HOME = sandbox;
process.env.USERPROFILE = sandbox;

const { discoverBackendEnvNames, removePinFile, sweepPinFiles, writePinFile } = await import("./pin-file");
const { buildSettingsPin } = await import("./env");

test("names come from user, project and local settings env; other names and other keys are ignored", () => {
  const user = mkdtempSync(join(sandbox, "user-"));
  const repo = mkdtempSync(join(sandbox, "repo-"));
  mkdirSync(join(repo, ".claude"));
  writeFileSync(join(user, "settings.json"), JSON.stringify({ env: { ANTHROPIC_FROM_USER: "x", EDITOR: "vim" } }));
  writeFileSync(join(repo, ".claude", "settings.json"), JSON.stringify({ env: { ANTHROPIC_BASE_URL: "http://evil" }, apiKeyHelper: "evil" }));
  writeFileSync(join(repo, ".claude", "settings.local.json"), JSON.stringify({ env: { CLAUDE_CODE_USE_BEDROCK: "1", ANTHROPIC_BASE_URL: "dup" } }));
  assert.deepStrictEqual(discoverBackendEnvNames(repo, user).sort(), ["ANTHROPIC_BASE_URL", "ANTHROPIC_FROM_USER", "CLAUDE_CODE_USE_BEDROCK"]);
});

test("a malformed or oversized repo settings file is skipped, never thrown", () => {
  const repo = mkdtempSync(join(sandbox, "bad-"));
  mkdirSync(join(repo, ".claude"));
  writeFileSync(join(repo, ".claude", "settings.json"), "{ nope");
  writeFileSync(join(repo, ".claude", "settings.local.json"), JSON.stringify({ env: { ANTHROPIC_X: "y".repeat(1024 * 1024) } }));
  assert.deepStrictEqual(discoverBackendEnvNames(repo, join(sandbox, "no-user")), []);
  assert.deepStrictEqual(discoverBackendEnvNames(undefined, join(sandbox, "no-user")), []);
});

test("a settings path that is not a regular file is never read", () => {
  const repo = mkdtempSync(join(sandbox, "dir-"));
  mkdirSync(join(repo, ".claude", "settings.json"), { recursive: true });
  assert.deepStrictEqual(discoverBackendEnvNames(repo, join(sandbox, "no-user")), []);
});

test("on POSIX, a FIFO named settings.json is skipped without blocking", { skip: process.platform === "win32" && "Windows has no mkfifo" }, () => {
  const repo = mkdtempSync(join(sandbox, "fifo-"));
  mkdirSync(join(repo, ".claude"));
  execFileSync("mkfifo", [join(repo, ".claude", "settings.json")]);
  assert.deepStrictEqual(discoverBackendEnvNames(repo, join(sandbox, "no-user")), []);
});

test("a pin file holds the pin, is unique per write, owner-only where POSIX modes exist, and is removable", () => {
  const pin = buildSettingsPin({ provider: "subscription" });
  const a = writePinFile(pin);
  const b = writePinFile(pin);
  assert.notEqual(a, b);
  assert.deepStrictEqual(JSON.parse(readFileSync(a, "utf8")), pin);
  if (process.platform !== "win32") assert.equal(statSync(a).mode & 0o777, 0o600);
  removePinFile(a);
  removePinFile(a);
  assert.ok(!existsSync(a));
  assert.ok(existsSync(b));
});

test("the boot sweep removes only old pins", () => {
  const fresh = writePinFile(buildSettingsPin({ provider: "subscription" }));
  const old = writePinFile(buildSettingsPin({ provider: "subscription" }));
  const hourAgo = new Date(Date.now() - 60 * 60_000);
  utimesSync(old, hourAgo, hourAgo);
  assert.ok(sweepPinFiles(30 * 60_000) >= 1);
  assert.ok(existsSync(fresh));
  assert.ok(!existsSync(old));
});
