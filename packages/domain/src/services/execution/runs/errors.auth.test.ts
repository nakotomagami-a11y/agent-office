/**
 * Regression test for auth-error classification. The real driver of the fix is
 * finalizeRun (in ../runs.ts), which — on a non-zero exit with no streamed
 * output — feeds the captured stderr through classifyResultError so an expired
 * OAuth session surfaces the in-app Sign-in card instead of a generic error.
 * This locks in that the exact CLI error strings classify as `auth_expired`.
 *
 *   npx tsx packages/domain/src/services/runs/errors.auth.test.ts
 */
import assert from "node:assert";
import { classifyResultError } from "./errors";

// The exact string the Claude CLI emits (from the user's screenshot).
const REAL = "Failed to authenticate: OAuth session expired and could not be refreshed";

const authCases = [
  REAL,
  "OAuth session expired",
  "Error: Not logged in. Please run `claude login`.",
  "Invalid API key",
  "credentials expired",
];
for (const text of authCases) {
  const { code } = classifyResultError(text, "");
  assert.strictEqual(code, "auth_expired", `expected auth_expired for: ${JSON.stringify(text)} — got ${code}`);
}

// stderr-in-context (how finalizeRun passes it): full stderr blob, empty output.
const blob = `Some banner line\n${REAL}\n`;
assert.strictEqual(classifyResultError(blob, "").code, "auth_expired", "multi-line stderr blob must still classify");

// A non-auth failure must NOT be misclassified as auth.
assert.strictEqual(classifyResultError("Error: ENOENT no such file", "").code, "unknown", "non-auth stays unknown");
assert.strictEqual(classifyResultError("", "some output").code, "unknown", "empty stderr stays unknown");

console.log("✓ auth-error classification: all", authCases.length + 3, "cases passed");
