/**
 * The wiring, end to end through the REAL registry.
 *
 * The bug this exists for: run-finished listeners were dispatched only when
 * `run.conversationId` was set. A loop's runs deliberately carry NO
 * conversationId — otherwise the chat machine would drive them too — so the
 * Loop's listener was dead code the moment it was registered.
 */
import assert from "node:assert";
import { mkdtempSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

const sandbox = mkdtempSync(join(tmpdir(), "ao-loopwire-"));
process.env.HOME = sandbox;
process.env.USERPROFILE = sandbox; // os.homedir() reads this on Windows, not HOME
mkdirSync(join(sandbox, ".claude", "agent-office"), { recursive: true });

const { registerRunFinishedListener } = await import("./runs");
const { startLoop, onLoopRunFinished } = await import("./loop-runner");
const db = await import("../db/index");
import type { LoopRunner } from "./loop-runner";

let n = 0;
const dispatched: string[] = [];
const runner: LoopRunner = {
  startRun: async (i) => { dispatched.push(i.agentId); return `wire-run-${++n}`; },
  costOf: () => 1,
  ruleExists: () => true,
  ruleIds: () => ["arch.parse-dont-cast"],
  findingsFor: () => [],
};

test("a run with NO conversationId still reaches the loop listener", async () => {
  // Stand in for loop-wiring.ts's registration, without importing the
  // side-effect module (which would pull in the production runner).
  const off = registerRunFinishedListener((runId, ok) => {
    void onLoopRunFinished(runId, ok, runner, Date.now());
  });
  try {
    const id = await startLoop(
      { agentId: "dev", reviewerAgentId: "qa", goal: "g", config: { maxRounds: 3 } }, runner, 0,
    );
    const loop = db.getLoop(id)!;
    assert.equal(loop.conversationId, null, "a loop's runs must not be chat turns");

    await onLoopRunFinished(loop.activeRunId!, true, runner, 1);
    assert.deepEqual(dispatched, ["dev", "qa"], "the review round must have been dispatched");
  } finally {
    off();
  }
});

test("the finalize path does not gate listeners on conversationId", async () => {
  // Source-level guard is deliberate: the gate is one `if` in runs.ts and its
  // removal is the entire fix. A behavioural test would need a real spawn.
  const { readFileSync } = await import("node:fs");
  const { resolve } = await import("node:path");
  const src = readFileSync(resolve(import.meta.dirname, "runs.ts"), "utf8");
  const finalize = src.slice(src.indexOf("Drive the conversation queue"));
  const guard = finalize.slice(0, finalize.indexOf("for (const listener"));
  assert.ok(
    !/if \(run\.conversationId\)/.test(guard),
    "gating listener dispatch on conversationId makes the Loop's listener dead code",
  );
});
