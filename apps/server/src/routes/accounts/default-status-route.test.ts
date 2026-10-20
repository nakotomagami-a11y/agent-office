/**
 * A fresh machine signs in to the default account before any credentials or account row exist,
 * so its status must answer then too (the inline sign-in in the first-run provider step).
 *
 *   pnpm --filter @agent-office/server test src/routes/accounts/default-status-route.test.ts
 */
import assert from "node:assert";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

const home = mkdtempSync(join(tmpdir(), "default-account-"));
process.env.HOME = home;
process.env.USERPROFILE = home;

const { GET } = await import("./[id]/status/route");

test("the default account's status answers with no credentials file and no row", async () => {
  const res = await GET(new Request("http://localhost/"), { params: Promise.resolve({ id: "default" }) });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.deepStrictEqual([body.id, body.ready], ["default", false]);
});
