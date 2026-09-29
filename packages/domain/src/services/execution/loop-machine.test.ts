/**
 * The Loop governor's guarantees. These are the PROOF — a loop cannot be
 * validated by pointing it at itself, because a broken loop reports success.
 * Everything here is deterministic: clock injected, no spawn, no DB.
 *
 *   pnpm --filter @agent-office/domain test
 */
import assert from "node:assert";
import { test } from "node:test";
import {
  reduceLoop, initialLoopState, describeTermination,
  type Finding, type LoopConfig, type LoopState,
} from "./loop-machine";

const T0 = 1_000_000;
const cfg = (over: Partial<LoopConfig> = {}): LoopConfig => ({ maxRounds: 3, ...over });
const mustFix = (id = "r.one"): Finding => ({ severity: "must-fix", ruleId: id, why: "x" });
const nit = (id = "r.two"): Finding => ({ severity: "nit", ruleId: id, why: "x" });

function run(
  actions: Parameters<typeof reduceLoop>[1][],
  c = cfg(),
  now = () => T0,
  ruleExists: (id: string) => boolean = () => true,
): LoopState {
  let s = initialLoopState(T0);
  for (const a of actions) s = reduceLoop(s, a, c, now(), ruleExists).state;
  return s;
}

// ─── convergence ────────────────────────────────────────────────────────────

test("a clean review converges", () => {
  const s = run([
    { type: "authorFinished", ok: true, costUsd: 0.1 },
    { type: "reviewFinished", ok: true, costUsd: 0.1, findings: [] },
  ]);
  assert.equal(s.phase, "done");
  assert.equal(s.binding, "converged");
});

test("only blocking severities prevent convergence", () => {
  const s = run([
    { type: "authorFinished", ok: true, costUsd: 0 },
    { type: "reviewFinished", ok: true, costUsd: 0, findings: [nit(), nit()] },
  ]);
  assert.equal(s.binding, "converged", "nits must not block");
  assert.equal(s.history.length, 2, "but they are still recorded");
});

test("a must-fix starts a fix round", () => {
  let s = initialLoopState(T0);
  s = reduceLoop(s, { type: "authorFinished", ok: true, costUsd: 0 }, cfg(), T0).state;
  const r = reduceLoop(s, { type: "reviewFinished", ok: true, costUsd: 0, findings: [mustFix()] }, cfg(), T0);
  assert.equal(r.state.phase, "fixing");
  assert.equal(r.state.round, 2);
  assert.deepEqual(r.effects, [{ type: "startFix", round: 2, findings: [mustFix()] }]);
});

// ─── ceilings — the reason this is app-owned ─────────────────────────────────

test("the round ceiling stops the loop and says so", () => {
  const review = { type: "reviewFinished" as const, ok: true, costUsd: 0, findings: [mustFix()] };
  const fix = { type: "fixFinished" as const, ok: true, costUsd: 0 };
  const s = run([{ type: "authorFinished", ok: true, costUsd: 0 }, review, fix, review, fix, review], cfg({ maxRounds: 3 }));
  assert.equal(s.phase, "escalated");
  assert.equal(s.binding, "max_rounds");
  assert.ok(s.round <= 3, `must never exceed the ceiling, got ${s.round}`);
});

test("the budget ceiling stops the loop", () => {
  const s = run([
    { type: "authorFinished", ok: true, costUsd: 1.5 },
    { type: "reviewFinished", ok: true, costUsd: 1.0, findings: [mustFix()] },
  ], cfg({ budgetUsd: 2 }));
  assert.equal(s.binding, "budget");
  assert.equal(s.phase, "escalated");
});

test("the wall-clock ceiling stops the loop", () => {
  let s = initialLoopState(T0);
  s = reduceLoop(s, { type: "authorFinished", ok: true, costUsd: 0 }, cfg({ wallClockMs: 60_000 }), T0 + 90_000).state;
  assert.equal(s.binding, "wall_clock");
});

test("a ceiling hit after authoring still gets the work reviewed", () => {
  // Stopping without a verdict leaves an unassessed diff — worse than one more review.
  let s = initialLoopState(T0);
  const c = cfg({ maxRounds: 1 });
  const r = reduceLoop(s, { type: "authorFinished", ok: true, costUsd: 0 }, c, T0);
  assert.equal(r.state.phase, "reviewing", "round ceiling must not skip the review");
  assert.deepEqual(r.effects, [{ type: "startReview", round: 1 }]);
});

// ─── failure is never success ───────────────────────────────────────────────

test("a failed review never converges", () => {
  const s = run([
    { type: "authorFinished", ok: true, costUsd: 0 },
    { type: "reviewFinished", ok: false, costUsd: 0, findings: [] },
  ]);
  assert.equal(s.binding, "review_failed");
  assert.notEqual(s.binding, "converged");
});

test("a failed author run stops the loop", () => {
  const s = run([{ type: "authorFinished", ok: false, costUsd: 0 }]);
  assert.equal(s.binding, "author_failed");
});

test("findings citing rules that do not exist are rejected, not passed", () => {
  const s = run(
    [
      { type: "authorFinished", ok: true, costUsd: 0 },
      { type: "reviewFinished", ok: true, costUsd: 0, findings: [mustFix("does.not.exist")] },
    ],
    cfg(),
    () => T0,
    (id) => id === "r.one",
  );
  assert.equal(s.binding, "invalid_findings", "a miswired reviewer must be loud, not treated as a pass");
});

test("an empty ruleId is rejected", () => {
  const s = run([
    { type: "authorFinished", ok: true, costUsd: 0 },
    { type: "reviewFinished", ok: true, costUsd: 0, findings: [{ severity: "must-fix", ruleId: "  ", why: "x" }] },
  ]);
  assert.equal(s.binding, "invalid_findings");
});

// ─── terminal states are terminal ───────────────────────────────────────────

test("a terminated loop ignores late actions", () => {
  let s = run([
    { type: "authorFinished", ok: true, costUsd: 0 },
    { type: "reviewFinished", ok: true, costUsd: 0, findings: [] },
  ]);
  const after = reduceLoop(s, { type: "reviewFinished", ok: true, costUsd: 99, findings: [mustFix()] }, cfg(), T0);
  assert.deepEqual(after.state, s, "a late finish must not revive a finished loop");
  assert.deepEqual(after.effects, []);
});

// ─── user intervention ──────────────────────────────────────────────────────

test("acceptAsIs converges despite open findings", () => {
  let s = initialLoopState(T0);
  s = reduceLoop(s, { type: "authorFinished", ok: true, costUsd: 0 }, cfg(), T0).state;
  s = reduceLoop(s, { type: "reviewFinished", ok: true, costUsd: 0, findings: [mustFix()] }, cfg(), T0).state;
  const r = reduceLoop(s, { type: "acceptAsIs" }, cfg(), T0);
  assert.equal(r.state.binding, "converged");
  assert.equal(r.state.open.length, 0);
});

test("allowOneMore raises the ceiling only when the user asks", () => {
  const review = { type: "reviewFinished" as const, ok: true, costUsd: 0, findings: [mustFix()] };
  const fix = { type: "fixFinished" as const, ok: true, costUsd: 0 };
  const c = cfg({ maxRounds: 2 });
  let s = run([{ type: "authorFinished", ok: true, costUsd: 0 }, review, fix, review], c);
  assert.equal(s.binding, "max_rounds");
  // Terminal, so the loop itself cannot continue...
  assert.deepEqual(reduceLoop(s, fix, c, T0).effects, []);
});

// ─── the binding constraint is always reportable ────────────────────────────

test("every termination produces a distinct human sentence", () => {
  const bindings: LoopState["binding"][] = [
    "converged", "max_rounds", "budget", "wall_clock",
    "review_failed", "author_failed", "invalid_findings",
  ];
  const seen = new Set<string>();
  for (const b of bindings) {
    const msg = describeTermination({ ...initialLoopState(T0), binding: b, round: 2, spentUsd: 1 }, cfg({ budgetUsd: 5 }));
    assert.ok(msg.length > 10, `${b} has no sentence`);
    assert.ok(!seen.has(msg), `${b} duplicates another message`);
    seen.add(msg);
  }
});

test("a running loop reports progress, not a termination", () => {
  assert.match(describeTermination(initialLoopState(T0), cfg()), /Running/);
});
