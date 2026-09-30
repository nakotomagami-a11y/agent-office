/**
 * The dispatcher. `loop-machine.ts` is covered on its own; what is untested
 * until here is that effects become real dispatches, that a finished run maps
 * to the RIGHT action for its phase, and that a duplicate finish cannot strand
 * or double-advance a loop.
 *
 * Runs against a throwaway $HOME sandbox — never touches real data.
 */
import assert from "node:assert";
import { mkdtempSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

const sandbox = mkdtempSync(join(tmpdir(), "ao-loop-"));
process.env.HOME = sandbox;
mkdirSync(join(sandbox, ".claude", "agent-office"), { recursive: true });

const { startLoop, advanceLoop, onLoopRunFinished } = await import("./loop-runner");
const db = await import("../db/index");
import type { LoopRunner } from "./loop-runner";
import type { Finding } from "./loop-machine";

const MUST: Finding = { severity: "must-fix", ruleId: "arch.parse-dont-cast", why: "cast" };

// Run ids must be unique ACROSS tests: they share one sandbox DB, and
// `getLoopByActiveRun` would otherwise match an earlier test's loop.
let suite = 0;

function makeRunner(over: Partial<LoopRunner> = {}) {
  const dispatched: Array<{ agentId: string; prompt: string }> = [];
  const tag = `t${++suite}`;
  let n = 0;
  const runner: LoopRunner = {
    startRun: async (i) => { dispatched.push({ agentId: i.agentId, prompt: i.prompt }); return `${tag}-run-${++n}`; },
    costOf: () => 1,
    ruleExists: () => true,
    ...over,
  };
  return { runner, dispatched, rid: (k: number) => `${tag}-run-${k}` };
}

const cfg = { maxRounds: 3 };

test("starting a loop dispatches the authoring run and records it as active", async () => {
  const { runner, dispatched, rid } = makeRunner();
  const id = await startLoop(
    { agentId: "dev", reviewerAgentId: "qa", goal: "ship it", config: cfg }, runner, 1000,
  );
  assert.equal(dispatched.length, 1);
  assert.equal(dispatched[0]!.agentId, "dev");
  assert.equal(db.getLoop(id)!.activeRunId, rid(1));
  assert.equal(db.getLoopByActiveRun(rid(1))!.id, id);
});

test("an authoring run finishing dispatches REVIEW, to the reviewer agent", async () => {
  const { runner, dispatched, rid } = makeRunner();
  const id = await startLoop({ agentId: "dev", reviewerAgentId: "qa", goal: "g", config: cfg }, runner, 0);
  await onLoopRunFinished(rid(1), true, runner, 1);
  assert.equal(dispatched[1]!.agentId, "qa", "review must go to the reviewer, not the author");
  assert.equal(db.getLoop(id)!.state.phase, "reviewing");
});

test("a blocking finding dispatches a FIX back to the author, citing it", async () => {
  const { runner, dispatched, rid } = makeRunner();
  const id = await startLoop({ agentId: "dev", reviewerAgentId: "qa", goal: "g", config: cfg }, runner, 0);
  await onLoopRunFinished(rid(1), true, runner, 1);
  await onLoopRunFinished(rid(2), true, runner, 2, [MUST]);
  assert.equal(dispatched[2]!.agentId, "dev");
  assert.match(dispatched[2]!.prompt, /arch\.parse-dont-cast/, "the fix prompt must name the finding it is for");
  assert.equal(db.getLoop(id)!.state.round, 2);
});

test("a clean review converges and dispatches nothing further", async () => {
  const { runner, dispatched, rid } = makeRunner();
  const id = await startLoop({ agentId: "dev", reviewerAgentId: "qa", goal: "g", config: cfg }, runner, 0);
  await onLoopRunFinished(rid(1), true, runner, 1);
  await onLoopRunFinished(rid(2), true, runner, 2, []);
  const loop = db.getLoop(id)!;
  assert.equal(loop.state.binding, "converged");
  assert.equal(loop.activeRunId, null, "a finished loop must not hold an active run");
  assert.equal(dispatched.length, 2);
});

test("a DUPLICATE finish neither advances nor strands the loop", async () => {
  const { runner, dispatched, rid } = makeRunner();
  const id = await startLoop({ agentId: "dev", reviewerAgentId: "qa", goal: "g", config: cfg }, runner, 0);
  await onLoopRunFinished(rid(1), true, runner, 1);
  const after = db.getLoop(id)!;
  await onLoopRunFinished(rid(1), true, runner, 2);
  const again = db.getLoop(id)!;
  assert.equal(dispatched.length, 2, "a replayed finish must not dispatch again");
  assert.equal(again.activeRunId, after.activeRunId, "the active run must survive a replayed finish");
  assert.equal(again.state.phase, after.state.phase);
});

test("an OUT-OF-PHASE action is ignored and does not strand the loop", async () => {
  // The replay test above never reaches the phase guard — `getLoopByActiveRun`
  // returns null first. This one hits `advanceLoop` directly, which is the only
  // way to exercise it. Without the guard the ignored action still persists a
  // null `active_run_id`, and the loop can never be advanced again.
  const { runner, dispatched, rid } = makeRunner();
  const id = await startLoop({ agentId: "dev", reviewerAgentId: "qa", goal: "g", config: cfg }, runner, 0);
  await onLoopRunFinished(rid(1), true, runner, 1);
  const before = db.getLoop(id)!;
  assert.equal(before.state.phase, "reviewing");

  await advanceLoop(id, { type: "fixFinished", ok: true, costUsd: 1 }, runner, 2);

  const after = db.getLoop(id)!;
  assert.equal(after.activeRunId, before.activeRunId, "an out-of-phase action must not clear the active run");
  assert.equal(after.state.phase, "reviewing");
  assert.equal(dispatched.length, 2, "an out-of-phase action must not dispatch work");
});

test("a finding citing an unresolvable rule is treated as a miswired reviewer", async () => {
  const { runner, rid } = makeRunner({ ruleExists: () => false });
  const id = await startLoop({ agentId: "dev", reviewerAgentId: "qa", goal: "g", config: cfg }, runner, 0);
  await onLoopRunFinished(rid(1), true, runner, 1);
  await onLoopRunFinished(rid(2), true, runner, 2, [{ ...MUST, ruleId: "no.such.rule" }]);
  assert.equal(db.getLoop(id)!.state.binding, "invalid_findings");
});

test("the budget ceiling binds and is reported as the reason", async () => {
  const { runner, dispatched, rid } = makeRunner({ costOf: () => 99 });
  const id = await startLoop(
    { agentId: "dev", reviewerAgentId: "qa", goal: "g", config: { maxRounds: 9, budgetUsd: 5 } }, runner, 0,
  );
  await onLoopRunFinished(rid(1), true, runner, 1);
  const loop = db.getLoop(id)!;
  assert.equal(loop.state.binding, "budget");
  assert.equal(dispatched.length, 1, "no review may be dispatched once the budget is spent");
});

test("state survives a reload — the loop is durable, not in-memory", async () => {
  const { runner, rid } = makeRunner();
  const id = await startLoop({ agentId: "dev", reviewerAgentId: "qa", goal: "g", config: cfg }, runner, 0);
  await onLoopRunFinished(rid(1), true, runner, 1);
  await onLoopRunFinished(rid(2), true, runner, 2, [MUST]);
  const reloaded = db.getLoop(id)!;
  assert.equal(reloaded.state.open.length, 1);
  assert.equal(reloaded.state.open[0]!.ruleId, "arch.parse-dont-cast");
  assert.equal(reloaded.state.history.length, 1);
  assert.equal(reloaded.config.maxRounds, 3);
});

test("CONCURRENT finishes for one run dispatch exactly once", async () => {
  // Honest scope: in-process this passes WITHOUT the compare-and-swap, because
  // better-sqlite3 is synchronous — the second call finds `active_run_id`
  // already cleared and returns early. This guards double-dispatch, which is
  // the behaviour that matters; it does NOT prove the CAS.
  const { runner, dispatched, rid } = makeRunner();
  const id = await startLoop({ agentId: "dev", reviewerAgentId: "qa", goal: "g", config: cfg }, runner, 0);
  await Promise.all([
    onLoopRunFinished(rid(1), true, runner, 1),
    onLoopRunFinished(rid(1), true, runner, 1),
  ]);
  assert.equal(dispatched.length, 2, "one author run + exactly one review run");
  assert.equal(db.getLoop(id)!.state.round, 1);
  assert.equal(db.getLoop(id)!.state.phase, "reviewing");
});

test("a user stop is reported as user_stopped, not as a review failure", async () => {
  const { runner } = makeRunner();
  const id = await startLoop({ agentId: "dev", reviewerAgentId: "qa", goal: "g", config: cfg }, runner, 0);
  await advanceLoop(id, { type: "stop" }, runner, 5);
  assert.equal(db.getLoop(id)!.state.binding, "user_stopped");
});
