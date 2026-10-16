/**
 * The reviewer's citations are checked against this set, and an unresolvable
 * citation fails the WHOLE batch. A resolver that drifts from the doc rejects
 * correct reviews — so it is parsed from the doc, and this asserts it agrees.
 */
import assert from "node:assert";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";
import { knownRuleIds, ruleExists } from "./loop-rules";
import { GENERAL_LOOP_RULES } from "../../config/loop";

const REPO = resolve(import.meta.dirname, "../../../../..");

test("every `## id` heading in the reviewed project's conventions.md resolves", () => {
  const doc = readFileSync(join(REPO, "docs", "conventions.md"), "utf8");
  const headings = [...doc.matchAll(/^## ([a-z][a-z0-9]*(?:[.-][a-z0-9]+)+)\s*$/gm)].map((m) => m[1]!);
  assert.ok(headings.length >= 5, `expected the real rule set, parsed ${headings.length}`);
  for (const id of headings) assert.ok(ruleExists(id, REPO), `rule ${id} is documented but does not resolve`);
  assert.deepEqual([...knownRuleIds(REPO)].sort(), [...new Set([...headings, ...GENERAL_LOOP_RULES])].sort());
});

test("a project with no conventions.md can still cite the general rules, and only those", () => {
  const bare = mkdtempSync(join(tmpdir(), "ao-rules-"));
  for (const cwd of [bare, null]) {
    assert.deepEqual([...knownRuleIds(cwd)].sort(), [...GENERAL_LOOP_RULES].sort());
    assert.equal(ruleExists("arch.parse-dont-cast", cwd), false, "another repo's rules must not leak in");
  }
});

test("an invented rule does not resolve", () => {
  for (const bad of ["no.such.rule", "", "  ", "Conventions", "arch"]) {
    assert.equal(ruleExists(bad, REPO), false, `${JSON.stringify(bad)} must not resolve`);
  }
});

test("a citation with stray whitespace still resolves", () => {
  assert.equal(ruleExists(" general.security ", null), true);
});
