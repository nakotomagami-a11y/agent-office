import assert from "node:assert";
import { test } from "node:test";
import { ownershipVerdict } from "./processes";

test("ownershipVerdict: a failed check is 503, never a false 403", () => {
  assert.deepStrictEqual(ownershipVerdict(null, 42, true), { ok: false, error: "ownership_unverified", status: 503 });
  assert.deepStrictEqual(ownershipVerdict(new Map(), 42, true), { ok: false, error: "forbidden", status: 403 });
  assert.deepStrictEqual(ownershipVerdict(new Map(), 42, false), { ok: false, error: "not_found", status: 404 });
  assert.strictEqual(ownershipVerdict(new Map([[42, {}]]), 42, true), null);
});
