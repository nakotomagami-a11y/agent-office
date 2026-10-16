/**
 * A CLI that dies without a result event used to surface as "The agent hit an
 * error." with no detail. classifyExitFailure turns its stderr + exit code
 * into the detail line the error card shows.
 *
 *   pnpm --filter @agent-office/domain test src/services/execution/runs/errors.exit.test.ts
 */
import assert from "node:assert";
import { test } from "node:test";
import { classifyExitFailure, classifyResultError, redactSecrets } from "./errors";

test("stderr becomes the detail, without Node stack frames", () => {
  const stderr = "TypeError: Cannot read properties of undefined (reading 'x')\n    at foo (cli.js:1:2)\n    at bar (cli.js:3:4)\n";
  const { code, detail } = classifyExitFailure(stderr, 1, { lastTool: "Bash" });
  assert.equal(code, "unknown");
  assert.equal(detail, "Claude CLI exited with code 1 (last tool: Bash): TypeError: Cannot read properties of undefined (reading 'x')");
});

test("silent exit still says how it ended", () => {
  assert.equal(classifyExitFailure("", 1).detail, "Claude CLI exited with code 1: no output on stderr");
  assert.equal(classifyExitFailure("", 1, { signal: "SIGKILL" }).detail, "Claude CLI was killed by SIGKILL: no output on stderr");
});

test("auth failures keep their own code", () => {
  assert.equal(classifyExitFailure("Failed to authenticate: OAuth session expired", 1).code, "auth_expired");
});

test("long stderr is capped", () => {
  assert.ok((classifyExitFailure("x".repeat(5000), 1).detail ?? "").length <= 300);
});

test("a Node crash surfaces its error line, not the path and source noise", () => {
  const stderr = [
    "file:///C:/npm/claude/cli.js:4123",
    "var a=b.c.d;function q(){return a.x.y.z}".repeat(20),
    "      ^",
    "",
    "TypeError: Cannot read properties of null (reading 'z')",
    "    at q (file:///C:/npm/claude/cli.js:4123:9)",
    "",
    "Node.js v22.11.0",
  ].join("\n");
  assert.equal(classifyExitFailure(stderr, 1).detail, "Claude CLI exited with code 1: TypeError: Cannot read properties of null (reading 'z')");
});

test("a bare Error: line wins over the trailing property dump", () => {
  const stderr = [
    "node:internal/modules/cjs/loader:1228",
    "  throw err;",
    "  ^",
    "",
    "Error: Cannot find module 'x'",
    "    at Module._resolveFilename (node:internal/modules/cjs/loader:1225:15)",
    "{",
    "  code: 'MODULE_NOT_FOUND',",
    "  requireStack: []",
    "}",
    "",
    "Node.js v22.11.0",
  ].join("\n");
  assert.equal(classifyExitFailure(stderr, 1).detail, "Claude CLI exited with code 1: Error: Cannot find module 'x'");
});

test("the auth card's detail is the auth line, not stderr preamble", () => {
  const stderr = "Loading config from C:/x\nOAuth session expired\nError: process exited with code 1";
  assert.deepEqual(classifyExitFailure(stderr, 1), { code: "auth_expired", detail: "OAuth session expired" });
});

test("a run that streamed output is never sent to Sign in", () => {
  const stderr = "gh: not logged in, please run gh auth login";
  assert.equal(classifyExitFailure(stderr, 1).code, "auth_expired");
  assert.equal(classifyExitFailure(stderr, 1, { output: "working on it" }).code, "unknown");
});

test("injected secret values are scrubbed", () => {
  assert.equal(redactSecrets("fetch https://u:hunter22@proxy failed", ["hunter22"]), "fetch https://u:***@proxy failed");
  assert.equal(redactSecrets("abc", ["ab"]), "abc", "values under 4 chars would shred unrelated text");
  assert.equal(redactSecrets(undefined, ["hunter22"]), undefined);
});

test("an auth line earlier in stderr still wins the Sign-in card", () => {
  assert.equal(classifyExitFailure("OAuth session expired\nError: process exited with code 1", 1).code, "auth_expired");
});

test("redacting before classifying leaves no piece of a secret at the cap boundary", () => {
  const secret = "sk-live-0123456789abcdefghij";
  const stderr = `Error: ${"x".repeat(270)} token ${secret} rejected`;
  const detail = classifyExitFailure(redactSecrets(stderr, [secret]) ?? "", 1).detail ?? "";
  assert.ok(!detail.includes(secret.slice(0, 8)), detail);
});

test("a secret containing another secret is scrubbed whole", () => {
  assert.equal(redactSecrets("key=abcd1234efgh", ["abcd", "abcd1234efgh"]), "key=***");
});

test("a streamed 'Not logged in' result gets the Sign-in card", () => {
  const out = "Not logged in · Please run /login";
  assert.deepEqual(classifyResultError("", out), { code: "auth_expired", detail: out });
});

test("an agent quoting another tool's login prompt is not sent to Claude Sign-in", () => {
  const out = "You're not logged in to gh — please run `gh auth login`";
  assert.equal(classifyResultError("", out).code, "unknown");
});
