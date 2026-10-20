/**
 * `shell-env.sh` wrote every attached secret's value in plain text on each tab
 * switch, while the Secrets tab said "encrypted at rest". On Windows the file
 * served no shell hook at all, and its `source` hint lost its backslashes.
 *
 *   pnpm --filter @agent-office/domain test src/services/accounts/shell-env.test.ts
 */
import assert from "node:assert";
import { test } from "node:test";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import Database from "better-sqlite3";
import { createSchema } from "../db/migrations";
import { APP_STATE_DIR, CLAUDE_DIR, HOME } from "../infra/paths";
import * as secrets from "./secrets";
import { SHELL_ENV_PATH, shellEnvScript, writeActiveShellEnv } from "./shell-env";

const mem = new Database(":memory:");
createSchema(mem);
globalThis.__agentOfficeDb = mem;

const root = join(HOME, "root");
mkdirSync(join(root, "proj"), { recursive: true });
mkdirSync(APP_STATE_DIR, { recursive: true });
writeFileSync(join(CLAUDE_DIR, "agent-office-settings.json"), JSON.stringify({ projectsRoot: root, excluded: [], firstRunComplete: true }));

const VALUE = "ghp_supersecretvalue123";
const secret = secrets.create({ name: "GITHUB_TOKEN", value: VALUE });
secrets.link("proj", secret.id);

test("the script never contains a secret value, only unsets its name", () => {
  const script = shellEnvScript("proj");
  assert.equal(script.includes(VALUE), false, "a plaintext secret value reached shell-env.sh");
  assert.match(script, /^unset .*\bGITHUB_TOKEN\b/m);
  assert.match(script, /^export AGENT_OFFICE_PROJECT=/m, "the project's non-secret env is still mirrored");
});

test("the source hint quotes the path, so backslashes survive bash", () => {
  const hint = shellEnvScript(null).split("\n").find((l) => l.includes("source"));
  assert.ok(hint?.includes(`source '${SHELL_ENV_PATH}'`), hint);
});

test("on Windows the file is not written, and an older copy is removed", () => {
  writeFileSync(SHELL_ENV_PATH, `export GITHUB_TOKEN='${VALUE}'\n`);
  writeActiveShellEnv("proj", "win32");
  assert.equal(existsSync(SHELL_ENV_PATH), false);
});

test("elsewhere the file is written without the value", () => {
  writeActiveShellEnv("proj", "linux");
  assert.equal(readFileSync(SHELL_ENV_PATH, "utf8").includes(VALUE), false);
});
