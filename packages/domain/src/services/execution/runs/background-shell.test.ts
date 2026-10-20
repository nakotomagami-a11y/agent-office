/**
 * A Bash call whose command keeps running after the call returns must not be
 * treated as finished: its imggen card would stop looking for the rest of its
 * images. Field and wording taken from the CLI 2.1.294 binary.
 *
 *   pnpm --filter @agent-office/domain test src/services/execution/runs/background-shell.test.ts
 */
import assert from "node:assert";
import { mock, test } from "node:test";
import Database from "better-sqlite3";
import { createSchema } from "../../db/migrations";
import * as db from "../../db";
import { log } from "../../infra/log";
import type { ProcessScanner } from "../process-scan";
import { isBackgroundedBashResult, noteEarlierChildren, pickShell, trackBackgroundShell } from "./background-shell";
import type { LiveRun } from "./types";

const mem = new Database(":memory:");
mem.pragma("foreign_keys = ON");
createSchema(mem);
globalThis.__agentOfficeDb = mem;
const scanReturning = (kids: Awaited<ReturnType<ProcessScanner["children"]>>): ProcessScanner =>
  ({ listeners: async () => [], details: async () => new Map(), children: async () => kids });
let runs = 0;
const newRun = (): LiveRun => {
  const id = `r${++runs}`;
  db.insertRun({ id, agentId: "dev", agentName: "Dev", status: "running", prompt: "p", model: "", effort: "", startedAt: 1 });
  return { id, agentId: "dev", agentName: "Dev", proc: { pid: 4242 } } as unknown as LiveRun;
};
const shellsOf = (run: LiveRun) => db.listBackgroundShells().filter((r) => r.runId === run.id).map((r) => [r.pid, r.command, r.startedAt]);

test("the shell is the child started after the call, never an earlier one", () => {
  const children = [{ pid: 1, startedAt: 1_000 }, { pid: 2, startedAt: 10_400 }, { pid: 3, startedAt: 10_100 }];
  assert.equal(pickShell(children, 10_000, new Set())?.pid, 3, "closest to the call");
  assert.equal(pickShell(children, 10_000, new Set([3]))?.pid, 2, "a shell an earlier call claimed is skipped");
  assert.equal(pickShell([{ pid: 1, startedAt: 1_000 }], 10_000, new Set()), null);
});

test("an MCP server the CLI started at boot is never taken for a shell, even right after boot", async () => {
  const run = newRun();
  const now = scanReturning([{ pid: 50, startedAt: 9_800 }, { pid: 51, startedAt: 10_050 }]);
  noteEarlierChildren(run, now); // a slow snapshot that already sees this call's shell
  await trackBackgroundShell(run, { command: "sleep 9", requestedAt: 10_000 }, now);
  assert.deepEqual(shellsOf(run), [[51, "sleep 9", 10_050]]);
});

test("two background calls in one message get one shell each", async () => {
  const run = newRun();
  const scan = scanReturning([{ pid: 70, startedAt: 20_010 }, { pid: 71, startedAt: 20_030 }]);
  await Promise.all([
    trackBackgroundShell(run, { command: "npm run dev", requestedAt: 20_000 }, scan),
    trackBackgroundShell(run, { command: "npm run worker", requestedAt: 20_000 }, scan),
  ]);
  assert.deepEqual(shellsOf(run).sort(), [[70, "npm run dev", 20_010], [71, "npm run worker", 20_030]]);
});

test("a failed process scan is logged, not read as \"no shell\"", async () => {
  const run = newRun();
  const warn = mock.method(log, "warn", () => {});
  try {
    await trackBackgroundShell(run, { command: "sleep 9", requestedAt: 10_000 }, scanReturning(null));
    await trackBackgroundShell(run, { command: "sleep 9", requestedAt: 10_000 }, null);
    assert.deepEqual(warn.mock.calls.map((c) => c.arguments[0]), ["background_shell.scan_failed", "background_shell.scan_failed"]);
    assert.deepEqual(shellsOf(run), []);
  } finally {
    warn.mock.restore();
  }
});

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
