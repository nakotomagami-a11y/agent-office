/**
 * The buttons must mirror the machine's ACCEPTS table. Offering one the
 * machine refuses produces a 409 the user cannot act on — a button that lies.
 */
import assert from "node:assert";
import { test } from "node:test";
import { availableActions, ceilingPressure, sortedOpen } from "./loop-view";
import type { LoopRow } from "@agent-office/domain/services/db/loops";

const NOW = 500;

const MUST = { severity: "must-fix", ruleId: "arch.parse-dont-cast", why: "cast" } as const;
const NIT = { severity: "nit", ruleId: "code.comments-explain-why", why: "meh" } as const;

const loop = (over: Partial<LoopRow["state"]>, cfg: Partial<LoopRow["config"]> = {}): LoopRow =>
  ({
    id: "l", conversationId: null, agentId: "d", instanceId: null, projectId: null,
    reviewerAgentId: "q", cwd: null, goal: "g", activeRunId: null, createdAt: 0, updatedAt: 0,
    config: { maxRounds: 3, ...cfg },
    state: { phase: "authoring", round: 1, spentUsd: 0, startedAt: 0, open: [], history: [], ...over },
  }) as LoopRow;

test("allow-one-more is offered ONLY on an escalated round ceiling with work open", () => {
  assert.equal(availableActions(loop({ phase: "escalated", binding: "max_rounds", open: [MUST] }), NOW).allowOneMore, true);
  // Every near-miss the machine would refuse:
  assert.equal(availableActions(loop({ phase: "escalated", binding: "max_rounds", open: [] }), NOW).allowOneMore, false);
  assert.equal(availableActions(loop({ phase: "escalated", binding: "budget", open: [MUST] }), NOW).allowOneMore, false);
  assert.equal(availableActions(loop({ phase: "reviewing", open: [MUST] }), NOW).allowOneMore, false);
});

test("allow-one-more is withdrawn once the WALL CLOCK has run out", () => {
  // Past the wall clock the machine does NOT refuse — it terminates and
  // reports success. Offering the button would silently kill the loop.
  const expired = loop({ phase: "escalated", binding: "max_rounds", open: [MUST], startedAt: 0 }, { wallClockMs: 100 });
  assert.equal(availableActions(expired, 50).allowOneMore, true, "still inside the window");
  assert.equal(availableActions(expired, 5_000).allowOneMore, false, "past it, the button must be gone");
});

test("accept-as-is is offered for ceilings and REFUSED for everything else", () => {
  for (const binding of ["max_rounds", "budget", "wall_clock"] as const) {
    assert.equal(availableActions(loop({ phase: "escalated", binding, open: [MUST] }), NOW).acceptAsIs, true, binding);
  }
  // Accepting these would relabel them as convergence — `invalid_findings`
  // exists precisely so a miswired reviewer is never read as a pass.
  for (const binding of ["user_stopped", "invalid_findings", "corrupt_state", "dispatch_failed", "review_failed"] as const) {
    assert.equal(availableActions(loop({ phase: "escalated", binding, open: [MUST] }), NOW).acceptAsIs, false, binding);
  }
});

test("stop is offered while live and withdrawn once settled", () => {
  for (const phase of ["authoring", "reviewing", "fixing"] as const) {
    assert.equal(availableActions(loop({ phase }), NOW).stop, true, phase);
  }
  assert.equal(availableActions(loop({ phase: "done", binding: "converged" }), NOW).stop, false);
  assert.equal(availableActions(loop({ phase: "escalated", binding: "max_rounds" }), NOW).stop, false);
});

test("the bar tracks the ceiling that will actually bind", () => {
  // Budget nearly spent beats an early round — the machine stops on budget.
  const p = ceilingPressure(loop({ round: 1, spentUsd: 9 }, { maxRounds: 10, budgetUsd: 10 }));
  assert.match(p.label, /\$9\.00 \/ \$10\.00/);
  assert.ok(p.fraction > 0.8);
  // With no budget configured it falls back to rounds rather than showing nothing.
  assert.match(ceilingPressure(loop({ round: 2 }, { maxRounds: 4 })).label, /round 2\/4/);
});

test("findings render most severe first", () => {
  assert.deepEqual(sortedOpen(loop({ open: [NIT, MUST] })).map((f) => f.severity), ["must-fix", "nit"]);
});
