import assert from "node:assert";
import { test } from "node:test";
import { COST_BASES } from "@agent-office/domain/config/providers";
import { formatRunCost, type CostWords } from "./run-cost";

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
