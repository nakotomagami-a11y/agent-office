/**
 * The reviewer's citations are checked against this set, and an unresolvable
 * citation fails the WHOLE batch. A resolver that drifts from the doc rejects
 * correct reviews — so it is parsed from the doc, and this asserts it agrees.
 */
import assert from "node:assert";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { test } from "node:test";
import { knownRuleIds, ruleExists } from "./loop-rules";

const REPO = resolve(import.meta.dirname, "../../../../..");

test("every `## id` heading in conventions.md resolves", () => {
  const doc = readFileSync(join(REPO, "docs", "conventions.md"), "utf8");
  const headings = [...doc.matchAll(/^## ([a-z][a-z0-9]*(?:[.-][a-z0-9]+)+)\s*$/gm)].map((m) => m[1]!);
  assert.ok(headings.length >= 5, `expected the real rule set, parsed ${headings.length}`);
  for (const id of headings) assert.ok(ruleExists(id), `rule ${id} is documented but does not resolve`);
  assert.deepEqual([...knownRuleIds()].sort(), [...new Set(headings)].sort());
});

test("an invented rule does not resolve", () => {
  for (const bad of ["no.such.rule", "", "  ", "Conventions", "arch"]) {
    assert.equal(ruleExists(bad), false, `${JSON.stringify(bad)} must not resolve`);
  }
});

test("a citation with stray whitespace still resolves", () => {
  const first = [...knownRuleIds()][0]!;
  assert.equal(ruleExists(` ${first} `), true);
});
