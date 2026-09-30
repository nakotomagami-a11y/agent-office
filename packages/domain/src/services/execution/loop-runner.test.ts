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

const { startLoop, advanceLoop, onLoopRunFinished, reconcileLoopIfStale } = await import("./loop-runner");
const db = await import("../db/index");
import type { LoopRunner } from "./loop-runner";
import type { Finding } from "./loop-machine";

const { getDb: getRawDb } = await import("../db/connection");
let rid2Base = 0;
const rid2 = (k: number) => `spawnfail-${rid2Base}-run-${k}`;

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

test("a spawn failure TERMINATES the loop instead of stranding it", async () => {
  let n = 0;
  const { runner } = makeRunner({
    startRun: async () => { if (++n > 1) throw new Error("bridge missing"); return rid2(1); },
  });
  const id = await startLoop({ agentId: "dev", reviewerAgentId: "qa", goal: "g", config: cfg }, runner, 0);
  await onLoopRunFinished(rid2(1), true, runner, 1);
  const loop = db.getLoop(id)!;
  assert.equal(loop.state.binding, "dispatch_failed", "a failed spawn must name itself, not vanish");
  assert.equal(loop.state.phase, "escalated");
  assert.notEqual(loop.state.binding, undefined, "a loop with no active run and no binding is unrecoverable");
});

test("a reaped run is reconciled rather than left reporting running", async () => {
  const { runner, rid } = makeRunner();
  const id = await startLoop({ agentId: "dev", reviewerAgentId: "qa", goal: "g", config: cfg }, runner, 0);
  // Simulate reapOrphanedRuns: it writes the runs table via raw SQL and knows
  // nothing about loops.
  db.insertRun({
    id: rid(1), agentId: "dev", agentName: "dev", status: "error",
    prompt: "p", model: "opus", effort: "high", startedAt: 0,
  });
  await reconcileLoopIfStale(id, runner, 5);
  assert.notEqual(db.getLoop(id)!.state.binding, undefined, "a loop whose run is provably dead must not report running");
});

test("a loop stranded with no active run is recovered, not left silent", async () => {
  const { runner } = makeRunner();
  const id = await startLoop({ agentId: "dev", reviewerAgentId: "qa", goal: "g", config: cfg }, runner, 0);
  db.updateLoopState(id, db.getLoop(id)!.state, null, 2);
  await reconcileLoopIfStale(id, runner, 6);
  assert.equal(db.getLoop(id)!.state.binding, "dispatch_failed");
});

test("a ceiling of Infinity is NOT read as unbounded", async () => {
  // JSON.stringify(Infinity) is `null`, so this can never arrive through
  // createLoop — the read guard only matters for a row written by an older
  // build or another process. Inject the raw column to reach it.
  const { runner, rid } = makeRunner({ costOf: () => 1_000_000 });
  const id = await startLoop({ agentId: "dev", reviewerAgentId: "qa", goal: "g", config: cfg }, runner, 0);
  getRawDb().prepare("UPDATE loops SET config_json=? WHERE id=?")
    .run('{"maxRounds":1e999,"budgetUsd":1e999,"wallClockMs":1e999}', id);

  const loaded = db.getLoop(id)!;
  assert.equal(loaded.config.maxRounds, 1, "a non-finite round ceiling must fall back to the safe floor");
  assert.equal(loaded.config.budgetUsd, undefined, "a non-finite budget is not a budget");
  assert.equal(loaded.config.wallClockMs, undefined, "a non-finite wall clock is not a limit");

  await onLoopRunFinished(rid(1), true, runner, 1);
  await onLoopRunFinished(rid(2), true, runner, 2, [MUST]);
  assert.equal(db.getLoop(id)!.state.binding, "max_rounds", "every ceiling unbounded would never terminate");
});

test("an unreadable binding never renders as still-running", () => {
  const { runner } = makeRunner();
  void runner;
  const id = "corrupt-" + Math.random().toString(36).slice(2);
  db.createLoop({
    id, conversationId: null, agentId: "d", instanceId: null, projectId: null,
    reviewerAgentId: "q", cwd: null, goal: "g",
    state: { phase: "authoring", round: 1, spentUsd: 0, startedAt: 0, open: [], history: [] },
    config: cfg, activeRunId: null,
  }, 0);
  getRawDb().prepare("UPDATE loops SET phase=?, binding=? WHERE id=?").run("not-a-phase", "from-the-future", id);
  const loop = db.getLoop(id)!;
  assert.equal(loop.state.phase, "escalated");
  assert.equal(loop.state.binding, "corrupt_state", "a termination must always NAME itself");
});

test("a user stop is reported as user_stopped, not as a review failure", async () => {
  const { runner } = makeRunner();
  const id = await startLoop({ agentId: "dev", reviewerAgentId: "qa", goal: "g", config: cfg }, runner, 0);
  await advanceLoop(id, { type: "stop" }, runner, 5);
  assert.equal(db.getLoop(id)!.state.binding, "user_stopped");
});
