/**
 * The secret form's Test button runs before the form is saved: the typed value
 * when there is one, else the stored value of the secret being edited.
 *
 *   pnpm --filter @agent-office/domain test src/services/accounts/secrets.draft-test.test.ts
 */
import assert from "node:assert";
import { test } from "node:test";
import Database from "better-sqlite3";
import { createSchema } from "../db/migrations";
import * as secrets from "./secrets";

const mem = new Database(":memory:");
createSchema(mem);
globalThis.__agentOfficeDb = mem;

const check = 'test "$DRAFT_TOKEN" = stored';

test("a draft runs its command with the typed value", async () => {
  assert.strictEqual((await secrets.testDraft({ name: "DRAFT_TOKEN", value: "stored", testCmd: check }))?.ok, true);
  assert.strictEqual((await secrets.testDraft({ name: "DRAFT_TOKEN", value: "other", testCmd: check }))?.ok, false);
});

test("a blank value falls back to the stored one, and nothing is persisted", async () => {
  const s = secrets.create({ name: "DRAFT_TOKEN", value: "stored" });
  assert.strictEqual((await secrets.testDraft({ name: "DRAFT_TOKEN", testCmd: check, id: s.id }))?.ok, true);
  assert.strictEqual(secrets.list().find((x) => x.id === s.id)?.lastTestedAt ?? null, null);
});

test("no value and no stored secret: nothing to run", async () => {
  assert.strictEqual((await secrets.testDraft({ name: "DRAFT_TOKEN", testCmd: check, id: "sec_missing" })), null);
  assert.strictEqual((await secrets.testDraft({ name: "DRAFT_TOKEN", testCmd: check })), null);
});

test("a draft may not set shell-steering or app-owned variables", () => {
  for (const n of ["PATH", "Path", "BASH_ENV", "NODE_OPTIONS", "DYLD_INSERT_LIBRARIES"]) assert.strictEqual(secrets.isDraftTestNameAllowed(n), false, n);
  assert.strictEqual(secrets.isDraftTestNameAllowed("VERCEL_TOKEN"), true);
});
