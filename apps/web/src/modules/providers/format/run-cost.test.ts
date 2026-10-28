import assert from "node:assert";
import { test } from "node:test";
import { COST_BASES } from "@agent-office/domain/config/providers";
import { formatRunCost, knownCostTotal, unknownCostCount, type CostWords } from "./run-cost";

const words: CostWords = { unknown: "—", free: "no cost", estimated: (a) => `est. ${a}` };

test("legacy rows keep showing the number they always showed", () => {
  assert.equal(formatRunCost(0.5, undefined, words), "$0.50");
  assert.equal(formatRunCost(0, undefined, words), "$0");
});

test("unknown cost is a dash and free cost says so, never $0", () => {
  assert.equal(formatRunCost(0, "unknown", words), "—");
  assert.equal(formatRunCost(0, "free", words), "no cost");
  assert.equal(formatRunCost(1.2, "estimated", words), "est. $1.20");
});

test("no cost basis can render empty", () => {
  for (const basis of COST_BASES) assert.notEqual(formatRunCost(0.01, basis, words), "", basis);
});

test("totals leave unknown-cost runs out and count them aside, so an unpriced run is never a free one", () => {
  const runs = [
    { cost: 1, costBasis: undefined },
    { cost: 2, costBasis: "billed" as const },
    { cost: 0, costBasis: "unknown" as const },
    { cost: 0.5, costBasis: "estimated" as const },
    { cost: 0, costBasis: "free" as const },
  ];
  assert.equal(knownCostTotal(runs), 3.5);
  assert.equal(unknownCostCount(runs), 1);
  assert.equal(unknownCostCount([]), 0);
});
