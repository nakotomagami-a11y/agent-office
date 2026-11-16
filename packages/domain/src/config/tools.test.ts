/**
 *   pnpm --filter @agent-office/domain test src/config/tools.test.ts
 */
import assert from "node:assert";
import { test } from "node:test";
import { withPairedTools } from "./tools";

test("a shell brings the other shell, and Read brings the search tools, each right after it", () => {
  assert.deepEqual(withPairedTools(["Read", "Write", "Bash"]), ["Read", "Grep", "Glob", "Write", "Bash", "PowerShell"]);
  assert.deepEqual(withPairedTools(["PowerShell"]), ["PowerShell", "Bash"]);
});

test("a companion already declared anywhere is not added again, and nothing is reordered", () => {
  assert.deepEqual(withPairedTools(["Read", "Grep", "Bash", "Glob", "PowerShell"]), ["Read", "Grep", "Bash", "Glob", "PowerShell"]);
  assert.deepEqual(withPairedTools(["Read", "Glob"]), ["Read", "Grep", "Glob"]);
});

test("lists without a paired tool, and restricted or look-alike names, are left alone", () => {
  assert.deepEqual(withPairedTools([]), []);
  assert.deepEqual(withPairedTools(["WebSearch", "mcp__x__*"]), ["WebSearch", "mcp__x__*"]);
  assert.deepEqual(withPairedTools(["Bash(git *)", "bash", "constructor"]), ["Bash(git *)", "bash", "constructor"]);
});

test("a restricted companion counts as declared, so it is not widened", () => {
  assert.deepEqual(withPairedTools(["Bash", "PowerShell(Get-ChildItem *)"]), ["Bash", "PowerShell(Get-ChildItem *)"]);
  assert.deepEqual(withPairedTools(["PowerShell", "Bash(git log *)"]), ["PowerShell", "Bash(git log *)"]);
});
