/**
 * Drives startRun against a stub `claude` this test writes itself, pointed at
 * through AO_CLAUDE_BIN — a real install on PATH cannot shadow it.
 *
 * - The prompt goes over stdin. The `--resume` retry used to spawn with stdin
 *   ignored, so the retry died on "Input must be provided…" every time — after
 *   an account switch, every follow-up message failed within 3 seconds.
 * - A run the user stops must say "stopped", not show a red "Run error".
 *
 *   pnpm --filter @agent-office/domain test src/services/execution/runs.resume-retry.test.ts
 */
import assert from "node:assert";
import { after, test } from "node:test";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const STUB = `
const args = process.argv.slice(2);
const say = (o) => process.stdout.write(JSON.stringify(o) + "\\n");
if (args.includes("--resume")) {
  process.stderr.write("No conversation found with session ID: dead\\n");
  say({ type: "result", is_error: true, session_id: "dead", errors: ["No conversation found with session ID: dead"] });
  process.exit(1);
}
let input = "";
process.stdin.on("data", (d) => (input += d));
process.stdin.on("end", () => {
  if (!input) {
    process.stderr.write("Error: Input must be provided either through stdin or as a prompt argument when using --print\\n");
    process.exit(1);
  }
  if (input === "HANG") return setInterval(() => {}, 1000);
  if (input === "NOAUTH") {
    process.stderr.write("Not logged in · Please run /login\\n");
    process.exit(1);
  }
  say({ type: "stream_event", event: { type: "content_block_delta", delta: { type: "text_delta", text: "got: " + input } } });
  say({ type: "result", is_error: false, session_id: "fresh" });
  process.exit(0);
});
`;

const dir = mkdtempSync(join(tmpdir(), "ao-claude-stub-"));
writeFileSync(join(dir, "stub.cjs"), STUB);
writeFileSync(join(dir, "claude.cmd"), `@node "%~dp0stub.cjs" %*\r\n`);
writeFileSync(join(dir, "claude"), `#!/bin/sh\nexec node "${join(dir, "stub.cjs")}" "$@"\n`);
chmodSync(join(dir, "claude"), 0o755);
process.env.AO_CLAUDE_BIN = join(dir, process.platform === "win32" ? "claude.cmd" : "claude");
after(() => rmSync(dir, { recursive: true, force: true }));

const { abortRun, attachEmit, startRun } = await import("./runs");
type SseEvent = import("./runs").SseEvent;

function run(stdin: string, args: string[]): { runId: string; events: SseEvent[]; done: Promise<void> } {
  const { runId } = startRun({ agentId: "t", agentName: "T", prompt: stdin, model: "m", effort: "e", args, stdin });
  const events: SseEvent[] = [];
  const done = new Promise<void>((resolve) => {
    attachEmit(runId, (e) => {
      events.push(e);
      if (e.name === "done") resolve();
    });
  });
  return { runId, events, done };
}

test("a failed --resume retries with the prompt, says so, and shows no error", async () => {
  const r = run("PROMPT-OVER-STDIN", ["-p", "--resume", "dead", "--output-format", "stream-json"]);
  await r.done;
  assert.deepEqual(r.events.filter((e) => e.name === "error").map((e) => e.data), []);
  assert.ok(r.events.some((e) => e.name === "chunk" && e.data.text === "got: PROMPT-OVER-STDIN"));
  assert.ok(r.events.some((e) => e.name === "chunk" && e.data.text.includes("Previous session not found")));
  const done = r.events.find((e) => e.name === "done");
  assert.ok(done?.name === "done");
  assert.equal(done.data.exitCode, 0);
  assert.equal(done.data.sessionId, "fresh");
});

test("a retry that hits an expired login still gets the Sign-in card", async () => {
  const r = run("NOAUTH", ["-p", "--resume", "dead", "--output-format", "stream-json"]);
  await r.done;
  const errors = r.events.filter((e) => e.name === "error");
  assert.equal(errors.length, 1);
  assert.ok(errors[0]?.name === "error");
  assert.equal(errors[0].data.code, "auth_expired");
});

test("stopping a run reports it as stopped", async () => {
  const r = run("HANG", ["-p", "--output-format", "stream-json"]);
  assert.ok(abortRun(r.runId));
  await r.done;
  const err = r.events.find((e) => e.name === "error");
  assert.ok(err?.name === "error");
  assert.equal(err.data.code, "stopped");
  assert.equal(err.data.interrupted, true);
});
