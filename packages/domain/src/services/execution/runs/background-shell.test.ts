/**
 * A Bash call whose command keeps running after the call returns must not be
 * treated as finished: its imggen card would stop looking for the rest of its
 * images. Wording copied from the CLI 2.1.294 binary.
 *
 *   pnpm exec tsx --test src/services/execution/runs/background-shell.test.ts
 */
import assert from "node:assert";
import { test } from "node:test";
import { isBackgroundedBashResult } from "./background-shell";

test("every CLI wording for a command that outlives its Bash call is recognised", () => {
  assert.ok(isBackgroundedBashResult("Command did not complete within its 120s timeout and was moved to the background (ID: b1). Output is being written to: /tmp/x"));
  assert.ok(isBackgroundedBashResult("Command was moved to the background (ID: b2) so that a message that arrived while it was running can reach you; it was not interrupted."));
  assert.ok(isBackgroundedBashResult("Command running in background with ID: b3. Output is being written to: /tmp/y."));
});

test("ordinary output is not", () => {
  assert.equal(isBackgroundedBashResult("/home/u/Documents/Generated Images/2026-10-08/10-00-00_fox_1.png"), false);
  assert.equal(isBackgroundedBashResult(""), false);
});
