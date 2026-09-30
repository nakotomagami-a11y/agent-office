/**
 * The background-shell watcher's decision, and the message it sends.
 *
 * This code existed untested while its own comment asserted something false:
 * that a still-running owning run was safe to skip because "Claude's own
 * in-session `BashOutput` polling" covered it. `BashOutput` does not exist in
 * the CLI (config/tools.ts lists it under RETIRED_TOOLS), so nothing covered
 * it. The guard turns out to be right anyway — but for a different reason, and
 * the load-bearing property is that a skipped row is DEFERRED, not dropped.
 *
 *   pnpm --filter @agent-office/domain test
 */
import assert from "node:assert";
import { test } from "node:test";
import { shouldWake, buildWakeMessage } from "./background-shell-watcher";
import type { BackgroundShellRow } from "../db";

test("a live shell is never woken, whatever the run is doing", () => {
  assert.equal(shouldWake(true, "running"), false);
  assert.equal(shouldWake(true, "finished"), false);
  assert.equal(shouldWake(true, undefined), false);
});

test("a dead shell whose run has finished is woken — the case nothing else reports", () => {
  assert.equal(shouldWake(false, "finished"), true);
});

test("a dead shell whose run is still going is DEFERRED, not dropped", () => {
  // The row stays in background_shells and is retried next tick, so the
  // notification arrives once the run ends. If this ever returns true, the
  // wake interleaves with the agent's own mid-turn output; if the caller ever
  // starts deleting skipped rows, the notification is lost entirely.
  assert.equal(shouldWake(false, "running"), false);
});

test("a dead shell whose run vanished is still woken", () => {
  // A missing run row must not strand the notification forever.
  assert.equal(shouldWake(false, undefined), true);
});

test("every non-running status wakes, so a new terminal state cannot strand a shell", () => {
  for (const status of ["finished", "failed", "cancelled", "needs_attention", "rate_limited"]) {
    assert.equal(shouldWake(false, status), true, `status '${status}' did not wake`);
  }
});

const row = (over: Partial<BackgroundShellRow> = {}): BackgroundShellRow =>
  ({ command: "pnpm build", description: "", ...over }) as BackgroundShellRow;

test("the wake message names the command so the agent can find its output", () => {
  const msg = buildWakeMessage(row());
  assert.match(msg, /pnpm build/);
  assert.match(msg, /no longer running/);
});

test("a described shell is identified by description AND command", () => {
  const msg = buildWakeMessage(row({ description: "release build" }));
  assert.match(msg, /release build/);
  assert.match(msg, /pnpm build/);
});
