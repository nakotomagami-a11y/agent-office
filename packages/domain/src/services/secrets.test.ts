/**
 * Self-check for the secrets store: CRUD + project link + env injection + live
 * verify/block. Run against a throwaway HOME so it never touches the real
 * ~/.claude (tsx, not bun — bun can't load better-sqlite3's native binding):
 *   HOME=$(mktemp -d) npx tsx packages/domain/src/services/secrets.test.ts
 */
import assert from "node:assert";
import { homedir } from "node:os";

import * as secrets from "./secrets";
import { resolveSpawnEnv } from "./runs";

const HOME = homedir();
assert(HOME.startsWith("/tmp") || HOME.includes("tmp"), "refusing to run outside a throwaway HOME");

const PROJECT = "demo-project";

// create → read-path omits value, stores metadata
const created = secrets.create({
  name: "VERCEL_TOKEN",
  label: "Vercel",
  value: "tok_abc123",
  expiresAt: Date.now() - 1000, // already expired
  testCmd: '[ "$VERCEL_TOKEN" = "tok_abc123" ]',
  verifyBeforeRun: true,
});
assert(!("value" in created), "list-shape must not leak the raw value");
assert(created.expired === true, "past expiresAt → expired badge");
assert(created.projectCount === 0, "new secret attached to nothing");

// link → shows up for the project, raw value retrievable for injection
assert(secrets.link(PROJECT, created.id) === true, "link ok");
const raw = secrets.listRawForProject(PROJECT);
assert(raw.length === 1 && raw[0]!.value === "tok_abc123", "raw value available to injector");
assert(secrets.listForProject(PROJECT)[0]!.projectCount === 1, "projectCount reflects the link");

// env injection: resolveSpawnEnv must set the named var to the value
const { env } = resolveSpawnEnv({
  agentId: "developer", agentName: "Developer", prompt: "p",
  model: "opus", effort: "high", args: [], projectId: PROJECT,
});
assert(env.VERCEL_TOKEN === "tok_abc123", "secret injected as its named env var");

// live test: passing command → ok, updates status
const pass = secrets.test(created.id);
assert(pass && pass.ok === true, "matching test command passes");
assert(secrets.list().find((s) => s.id === created.id)!.lastTestOk === true, "status persisted");

// verify-before-run: a failing command blocks
secrets.update(created.id, { testCmd: "exit 3" });
const failed = secrets.verifyForProject(PROJECT);
assert(failed && failed.name === "VERCEL_TOKEN", "failing verify blocks the run");

// unknown (no test cmd) never blocks
secrets.update(created.id, { testCmd: null });
assert(secrets.verifyForProject(PROJECT) === null, "no test command → never blocks");

// unlink then delete
secrets.unlink(PROJECT, created.id);
assert(secrets.listForProject(PROJECT).length === 0, "unlink detaches");
assert(secrets.remove(created.id) === true, "delete ok");
assert(secrets.get(created.id) === null, "gone after delete");

console.log("ok — secrets CRUD, injection, live-verify block contract holds");
