/**
 * The reliability core of the permission channel. A parked request holds a live
 * child process and a sleep inhibitor, so "never block forever" and "never
 * default to allow" are the two properties that matter.
 */
import assert from "node:assert";
import { test } from "node:test";
import {
  requestPermission, resolvePermission, denyAllForRun, listPending, MAX_PENDING_PER_RUN,
} from "./permissions";

test("a request resolves with the decision it is given", async () => {
  let id = "";
  const p = requestPermission({ runId: "r1", tool: "Bash", input: { command: "ls" }, onCreated: (r) => { id = r.id; } });
  assert.ok(id, "onCreated must fire synchronously so the caller can broadcast before awaiting");
  assert.equal(resolvePermission("r1", id, "allow"), true);
  assert.equal(await p, "allow");
});

test("an unanswered request DENIES, never allows", async () => {
  const p = requestPermission({ runId: "r2", tool: "Bash", input: {}, timeoutMs: 20 });
  assert.equal(await p, "deny", "a user who walked away must not silently approve");
});

test("a late or duplicate answer is ignored, not thrown", async () => {
  let id = "";
  const p = requestPermission({ runId: "r3", tool: "Write", input: {}, onCreated: (r) => { id = r.id; } });
  resolvePermission("r3", id, "deny");
  await p;
  assert.equal(resolvePermission("r1", id, "allow"), false, "must not resolve a second time");
  assert.equal(resolvePermission("r3", "no-such-id", "allow"), false);
});

test("ending a run denies everything still parked for it", async () => {
  const a = requestPermission({ runId: "r4", tool: "Bash", input: {} });
  const b = requestPermission({ runId: "r4", tool: "Edit", input: {} });
  const other = requestPermission({ runId: "r5", tool: "Bash", input: {} });
  assert.equal(listPending("r4").length, 2);
  assert.equal(denyAllForRun("r4"), 2);
  assert.equal(await a, "deny");
  assert.equal(await b, "deny");
  assert.equal(listPending("r4").length, 0);
  assert.equal(listPending("r5").length, 1, "other runs untouched");
  denyAllForRun("r5"); await other;
});

test("listPending never leaks the resolver or timer", () => {
  requestPermission({ runId: "r6", tool: "Bash", input: {} });
  const [p] = listPending("r6");
  assert.ok(p);
  assert.deepEqual(Object.keys(p).sort(), ["createdAt", "id", "input", "runId", "tool"]);
  denyAllForRun("r6");
});

test("a decision for the WRONG run is rejected", () => {
  let id = "";
  const p = requestPermission({ runId: "owner", tool: "Bash", input: {}, onCreated: (r) => { id = r.id; } });
  assert.equal(resolvePermission("someone-else", id, "allow"), false, "the runId in the URL must not be decorative");
  assert.equal(resolvePermission("owner", id, "deny"), true);
  void p;
});

test("parked requests are capped per run, and the overflow denies", async () => {
  const pending = [];
  for (let i = 0; i < MAX_PENDING_PER_RUN; i++) {
    pending.push(requestPermission({ runId: "flood", tool: "Bash", input: {} }));
  }
  assert.equal(await requestPermission({ runId: "flood", tool: "Bash", input: {} }), "deny",
    "beyond the cap must fail closed, not park unboundedly");
  denyAllForRun("flood");
  await Promise.all(pending);
});
