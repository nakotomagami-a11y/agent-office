/**
 * A Bash call whose command keeps running after the call returns must not be
 * treated as finished: its imggen card would stop looking for the rest of its
 * images. Field and wording taken from the CLI 2.1.294 binary.
 *
 *   pnpm --filter @agent-office/domain test src/services/execution/runs/background-shell.test.ts
 */
import assert from "node:assert";
import { test } from "node:test";
import { isBackgroundedBashResult } from "./background-shell";

test("Bash's structured output decides when present, whatever the text says", () => {
  assert.ok(isBackgroundedBashResult({ stdout: "", backgroundTaskId: "b1", timedOutAfterMs: 120000 }, ""));
  assert.equal(isBackgroundedBashResult({ stdout: "Command running in background with ID: x" }, "Command running in background with ID: x"), false);
  assert.equal(isBackgroundedBashResult({ type: "text", file: { content: "moved to the background (ID: " } }, "moved to the background (ID: "), false, "a Read of this code");
});

test("without structured output, every CLI wording is recognised", () => {
  assert.ok(isBackgroundedBashResult(undefined, "Command did not complete within its 120s timeout and was moved to the background (ID: b1). Output is being written to: /tmp/x"));
  assert.ok(isBackgroundedBashResult(undefined, "Command was moved to the background (ID: b2) so that a message that arrived while it was running can reach you; it was not interrupted."));
  assert.ok(isBackgroundedBashResult("Error: x", "Command running in background with ID: b3. Output is being written to: /tmp/y."));
});

test("ordinary output is not", () => {
  assert.equal(isBackgroundedBashResult(undefined, "/home/u/Documents/Generated Images/2026-10-08/10-00-00_fox_1.png"), false);
  assert.equal(isBackgroundedBashResult(undefined, ""), false);
});
