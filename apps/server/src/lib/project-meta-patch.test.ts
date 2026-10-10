/**
 * The request-shape half of the project.md write-integrity fix.
 *
 * The domain applies only keys that are PRESENT on the patch, so the whole
 * guarantee rests on this schema never inventing a key the client did not
 * send. The 2026-09-30 data loss came from the route doing exactly that
 * (`accountId: data.meta.accountId ?? undefined`), which turned every
 * unrelated patch into a silent field wipe. The domain-level tests cannot
 * catch that regression — it lives here.
 */
import assert from "node:assert";
import { test } from "node:test";
import { projectMetaPatchSchema } from "@agent-office/api-contract";
import { toProjectUpdatePatch } from "./project-patch";

function meta(body: unknown): Record<string, unknown> {
  const parsed = projectMetaPatchSchema.safeParse(body);
  assert.ok(parsed.success, `expected the body to parse: ${JSON.stringify(parsed.error?.issues)}`);
  return (parsed.data.meta ?? {}) as Record<string, unknown>;
}

test("a patch that omits accountId does not carry the key at all", () => {
  const m = meta({ meta: { shelved: true } });
  assert.equal("accountId" in m, false, "a present-but-undefined key is what wiped the account");
  assert.equal("githubAccountId" in m, false);
  assert.equal(m.shelved, true);
});

test("an explicit null survives parsing, so 'clear this field' stays expressible", () => {
  const m = meta({ meta: { accountId: null } });
  assert.equal("accountId" in m, true);
  assert.equal(m.accountId, null);
});

test("a real accountId passes through unchanged", () => {
  assert.equal(meta({ meta: { accountId: "acc_123" } }).accountId, "acc_123");
});

test("roster is stripped — it is not writable through this route", () => {
  const m = meta({ meta: { name: "X", roster: [{ instanceId: "a", agentId: "developer" }] } });
  assert.equal("roster" in m, false, "a whole-array write would drop instances it never knew about");
  assert.equal(m.name, "X");
});

test("an empty meta object stays empty — no defaults are invented", () => {
  assert.deepEqual(Object.keys(meta({ meta: {} })), []);
});

test("expectedRev is accepted and is optional", () => {
  const withRev = projectMetaPatchSchema.safeParse({ meta: { name: "X" }, expectedRev: "abc123" });
  assert.equal(withRev.success, true);
  assert.equal(withRev.data?.expectedRev, "abc123");
  assert.equal(projectMetaPatchSchema.safeParse({ meta: { name: "X" } }).success, true);
});

test("an empty expectedRev is rejected rather than silently meaning 'no check'", () => {
  assert.equal(projectMetaPatchSchema.safeParse({ meta: { name: "X" }, expectedRev: "" }).success, false);
});

// --- the mapping the route actually applies ---------------------------------

function patchFor(body: unknown) {
  const parsed = projectMetaPatchSchema.safeParse(body);
  assert.ok(parsed.success);
  return toProjectUpdatePatch(parsed.data);
}

test("the route mapping does not invent an accountId key", () => {
  const p = patchFor({ meta: { shelved: true } });
  assert.equal("accountId" in (p.meta as object), false, "this is the exact 2026-09-30 regression");
  assert.equal("githubAccountId" in (p.meta as object), false);
});

test("the route mapping preserves an explicit null clear", () => {
  assert.equal(patchFor({ meta: { accountId: null } }).meta?.accountId, null);
});

test("the route mapping forwards expectedRev so the 409 check can fire", () => {
  assert.equal(patchFor({ meta: { name: "X" }, expectedRev: "r1" }).expectedRev, "r1");
});

test("the route mapping never forwards a roster", () => {
  const p = patchFor({ meta: { name: "X", roster: [{ instanceId: "a", agentId: "developer" }] } });
  assert.equal("roster" in (p.meta as object), false);
});
