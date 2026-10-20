/**
 * Removing an account must remove its config folder. The guard was
 * `dir.startsWith(ACCOUNTS_DIR + "/")`, which no Windows path satisfies: the
 * account vanished from the list while its folder (gh's `hosts.yml` token, the
 * Claude login) stayed on disk.
 *
 *   pnpm --filter @agent-office/domain test src/services/accounts/accounts.remove-dir.test.ts
 */
import assert from "node:assert";
import { test } from "node:test";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import Database from "better-sqlite3";
import { createSchema } from "../db/migrations";
import * as accounts from "./accounts";
import * as githubAccounts from "./github-accounts";
import { ACCOUNTS_DIR, GITHUB_ACCOUNTS_DIR, accountConfigDir } from "../infra/paths";

const mem = new Database(":memory:");
createSchema(mem);
globalThis.__agentOfficeDb = mem;

test("removing a GitHub account deletes its gh config folder, token included", () => {
  const acc = githubAccounts.create({ label: "work" });
  writeFileSync(join(acc.configDir, "hosts.yml"), "github.com:\n    oauth_token: gho_x\n");

  assert.equal(githubAccounts.remove(acc.id).ok, true);
  assert.equal(existsSync(acc.configDir), false);
  assert.equal(existsSync(GITHUB_ACCOUNTS_DIR), true, "only the account's own folder goes");
});

test("removing a Claude account deletes its config folder", () => {
  const id = "acc_removedir1";
  const dir = accountConfigDir(id);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, ".credentials.json"), "{}");
  mem.prepare("INSERT INTO accounts (id, label, config_dir, created_at) VALUES (?, 'x', ?, 1)").run(id, dir);

  assert.equal(accounts.remove(id).ok, true);
  assert.equal(existsSync(dir), false);
  assert.equal(existsSync(ACCOUNTS_DIR), true, "only the account's own folder goes");
});
