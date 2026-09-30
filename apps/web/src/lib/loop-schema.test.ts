/**
 * The hybrid shape's load-bearing claim: the AGENT drives each round's content,
 * the APP owns the ceilings. That only holds if the ceilings cannot be widened
 * through the API — an unbounded `maxRounds` hands the loop back to the agent.
 */
import assert from "node:assert";
import { test } from "node:test";
import { startLoopSchema, loopActionSchema } from "./validation-schemas";

const base = { agentId: "dev", reviewerAgentId: "qa", goal: "g", maxRounds: 3 };

test("a sane request passes", () => {
  assert.equal(startLoopSchema.safeParse(base).success, true);
});

test("a ceiling cannot be widened past the app's own bound", () => {
  for (const bad of [0, -1, 1e9, 21, 2.5, Infinity, NaN]) {
    assert.equal(
      startLoopSchema.safeParse({ ...base, maxRounds: bad }).success, false,
      `maxRounds ${String(bad)} must be rejected — it is not a ceiling`,
    );
  }
});

test("budget and wall clock are bounded and finite", () => {
  for (const bad of [0, -5, Infinity, NaN, 100_000]) {
    assert.equal(startLoopSchema.safeParse({ ...base, budgetUsd: bad }).success, false, `budget ${String(bad)}`);
  }
  for (const bad of [0, -1, Infinity, 99 * 60 * 60 * 1000]) {
    assert.equal(startLoopSchema.safeParse({ ...base, wallClockMs: bad }).success, false, `wallClock ${String(bad)}`);
  }
});

test("ceilings are optional except the round ceiling, which is not", () => {
  assert.equal(startLoopSchema.safeParse({ ...base, budgetUsd: undefined }).success, true);
  const { maxRounds: _omitted, ...noRounds } = base;
  assert.equal(startLoopSchema.safeParse(noRounds).success, false, "a loop with no round ceiling is unbounded");
});

test("only the three user interventions are accepted", () => {
  for (const ok of ["stop", "acceptAsIs", "allowOneMore"]) {
    assert.equal(loopActionSchema.safeParse({ action: ok }).success, true, ok);
  }
  for (const bad of ["reviewFinished", "authorFinished", "fixFinished", "", "STOP"]) {
    assert.equal(
      loopActionSchema.safeParse({ action: bad }).success, false,
      `${bad} is a machine action — a user must not be able to forge one`,
    );
  }
});
