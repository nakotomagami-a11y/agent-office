/**
 * The buttons must mirror the machine's ACCEPTS table. Offering one the
 * machine refuses produces a 409 the user cannot act on — a button that lies.
 */
import assert from "node:assert";
import { test } from "node:test";
import { availableActions, ceilingPressure, sortedOpen } from "./loop-view";
import type { LoopRow } from "@agent-office/domain/services/db/loops";

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
  assert.equal(availableActions(loop({ phase: "escalated", binding: "max_rounds", open: [MUST] })).allowOneMore, true);
  // Every near-miss the machine would refuse:
  assert.equal(availableActions(loop({ phase: "escalated", binding: "max_rounds", open: [] })).allowOneMore, false);
  assert.equal(availableActions(loop({ phase: "escalated", binding: "budget", open: [MUST] })).allowOneMore, false);
  assert.equal(availableActions(loop({ phase: "reviewing", open: [MUST] })).allowOneMore, false);
});

test("stop is offered while live and withdrawn once settled", () => {
  for (const phase of ["authoring", "reviewing", "fixing"] as const) {
    assert.equal(availableActions(loop({ phase })).stop, true, phase);
  }
  assert.equal(availableActions(loop({ phase: "done", binding: "converged" })).stop, false);
  assert.equal(availableActions(loop({ phase: "escalated", binding: "max_rounds" })).stop, false);
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
