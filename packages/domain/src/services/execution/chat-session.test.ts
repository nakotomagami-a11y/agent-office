/**
 * A conversation's live process against a stub `claude` (AO_CLAUDE_BIN) that speaks the CLI's
 * stream-json protocol as observed from the real one (runs.chat-session.e2e.test.ts checks that
 * against the real CLI): replays each message by our uuid, takes a message written mid-turn at the
 * next tool result, runs one written after the answer began as the next turn, reports a background
 * task with a turn of its own, answers an interrupt with an error `result` and stays alive.
 *
 *   pnpm --filter @agent-office/domain test src/services/execution/chat-session.test.ts
 */
import assert from "node:assert";
import { after, test } from "node:test";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import type { ConversationRow } from "../db";
import { join } from "node:path";

const STUB = `
const { appendFileSync } = require("node:fs");
const args = process.argv.slice(2);
if (args.includes("--version")) { process.stdout.write("2.1.327 (Claude Code)\\n"); process.exit(0); }
appendFileSync(process.env.STUB_SPAWNS, "spawn\\n");
const say = (o) => process.stdout.write(JSON.stringify(o) + "\\n");
const resumeAt = args.indexOf("--resume");
if (resumeAt !== -1 && args[resumeAt + 1] === "dead") {
  process.stderr.write("No conversation found with session ID: dead\\n");
  say({ type: "result", subtype: "error_during_execution", is_error: true, session_id: "dead", total_cost_usd: 0 });
  process.exit(1);
}
const session = resumeAt !== -1 ? args[resumeAt + 1] : "sess-new";
let cost = 0;
let busy = false;
let midTurn = null;
let interrupted = false;
const waiting = [];
const text = (m) => (typeof m.message.content === "string" ? m.message.content : "");
const replay = (m) => say({ type: "user", isReplay: true, uuid: m.uuid, session_id: session, message: m.message });
const result = (isError) => { cost += 0.01; say({ type: "result", is_error: isError, session_id: session, total_cost_usd: cost, usage: { input_tokens: 5, output_tokens: 2 } }); };
const answer = (s) => say({ type: "stream_event", parent_tool_use_id: null, event: { type: "content_block_delta", delta: { type: "text_delta", text: s } } });

function next() {
  if (busy || waiting.length === 0) return;
  const m = waiting.shift();
  busy = true;
  say({ type: "system", subtype: "init", session_id: session });
  replay(m);
  const body = text(m).split("\\n").pop();
  if (body === "CRASH") { process.stderr.write("Not logged in · Please run /login\\n"); process.exit(1); }
  if (body === "SLOW") {
    say({ type: "assistant", parent_tool_use_id: null, message: { content: [{ type: "tool_use", id: "tu-slow", name: "Bash", input: { command: "sleep" } }] } });
    midTurn = [];
    return setTimeout(() => {
      if (interrupted) return;
      const read = midTurn; midTurn = null;
      say({ type: "user", parent_tool_use_id: null, message: { content: [{ type: "tool_result", tool_use_id: "tu-slow", content: "slept" }] } });
      for (const r of read) replay(r);
      answer("done" + read.map((r) => " +" + text(r)).join(""));
      finish(false);
    }, 400);
  }
  if (body === "BG") {
    say({ type: "assistant", parent_tool_use_id: null, message: { content: [{ type: "tool_use", id: "tu-bg", name: "Agent", input: { subagent_type: "explore", prompt: "dig", run_in_background: true } }] } });
    say({ type: "system", subtype: "task_started", task_id: "t1", tool_use_id: "tu-bg", is_backgrounded: true });
    say({ type: "system", subtype: "background_tasks_changed", tasks: [{ task_id: "t1" }] });
    say({ type: "user", parent_tool_use_id: null, message: { content: [{ type: "tool_result", tool_use_id: "tu-bg", content: "Async agent launched successfully." }] } });
    answer("started it");
    finish(false);
    return setTimeout(() => {
      say({ type: "system", subtype: "background_tasks_changed", tasks: [] });
      say({ type: "system", subtype: "task_notification", task_id: "t1", tool_use_id: "tu-bg", status: "completed", summary: "dig finished" });
      busy = true;
      answer("the dig is done");
      finish(false);
    }, 300);
  }
  answer("got: " + body);
  finish(false);
}
function finish(isError) { result(isError); busy = false; setImmediate(next); }

let buf = "";
process.stdin.on("data", (d) => {
  buf += d;
  let nl;
  while ((nl = buf.indexOf("\\n")) !== -1) {
    const line = buf.slice(0, nl); buf = buf.slice(nl + 1);
    const m = JSON.parse(line);
    if (m.type === "control_request" && m.request.subtype === "interrupt") {
      say({ type: "control_response", response: { subtype: "success", request_id: m.request_id } });
      if (midTurn) { interrupted = true; midTurn = null; finish(true); }
      continue;
    }
    if (midTurn) midTurn.push(m); else { waiting.push(m); next(); }
  }
});
process.stdin.on("end", () => { const wait = setInterval(() => { if (!busy && waiting.length === 0) { clearInterval(wait); process.exit(0); } }, 20); });
`;

const sandbox = mkdtempSync(join(tmpdir(), "ao-chat-session-"));
process.env.HOME = sandbox;
process.env.USERPROFILE = sandbox;
const dir = mkdtempSync(join(tmpdir(), "ao-claude-stub-"));
const spawnLog = join(dir, "spawns.log");
writeFileSync(spawnLog, "");
process.env.STUB_SPAWNS = spawnLog;
writeFileSync(join(dir, "stub.cjs"), STUB);
writeFileSync(join(dir, "claude.cmd"), `@node "%~dp0stub.cjs" %*\r\n`);
writeFileSync(join(dir, "claude"), `#!/bin/sh\nexec node "${join(dir, "stub.cjs")}" "$@"\n`);
chmodSync(join(dir, "claude"), 0o755);
process.env.AO_CLAUDE_BIN = join(dir, process.platform === "win32" ? "claude.cmd" : "claude");
after(() => rmSync(dir, { recursive: true, force: true }));

const { AGENTS_DIR } = await import("../infra/paths");
mkdirSync(AGENTS_DIR, { recursive: true });
writeFileSync(join(AGENTS_DIR, "dev.md"), "---\nname: dev\ndescription: test agent\n---\nYou help.\n");
(await import("../providers/store")).setSelection("subscription", "chosen");

const db = await import("../db");
const chat = await import("./chat-session");
const { abortRun } = await import("./runs");
type SessionEvent = import("./chat-session-registry").SessionEvent;

const events: SessionEvent[] = [];
chat.onSessionEvent((e) => events.push(e));
after(() => chat.killAllSessions());

const spawns = () => readFileSync(spawnLog, "utf8").split("\n").filter(Boolean).length;
let seq = 0;
const send = (conv: ConversationRow, text: string) =>
  chat.deliver({ ...conv }, { id: `in-${++seq}-${Date.now()}`, text, origin: "user" }, {});

async function until<T>(what: string, probe: () => T | undefined | false, ms = 5000): Promise<T> {
  const end = Date.now() + ms;
  for (;;) {
    const v = probe();
    if (v) return v;
    if (Date.now() > end) throw new Error(`timed out waiting for ${what}`);
    await new Promise((r) => setTimeout(r, 15));
  }
}
const idleSeen = (convId: string, from: number) => events.slice(from).some((e) => e.type === "idle" && e.convId === convId);
const turnsOf = (convId: string) => db.listConversationTurns(convId);
const fresh = (instanceId: string) => db.startNewConversation("dev", instanceId, null);

test("a message sent while the agent works is read in the same turn, by the same process", async () => {
  const conv = fresh("steer");
  const before = spawns();
  const from = events.length;
  assert.deepEqual(await send(conv, "SLOW"), { ok: true });
  await until("the turn to open", () => events.some((e) => e.type === "turnOpened" && e.convId === conv.id));
  assert.deepEqual(await send(conv, "add tests"), { ok: true });
  await until("idle", () => idleSeen(conv.id, from));
  const turns = turnsOf(conv.id);
  assert.equal(turns.length, 1, "one turn: the message did not start another");
  assert.equal(turns[0]!.prompt, "SLOW");
  assert.deepEqual(turns[0]!.inputs?.map((i) => i.text), ["add tests"]);
  assert.match(turns[0]!.output, /done \+add tests/);
  assert.equal(spawns() - before, 1);
  assert.equal(db.listPendingInputs(conv.id).length, 0);
});

test("a message after the turn becomes the next turn of the same process, resuming nothing new", async () => {
  const conv = fresh("next");
  const before = spawns();
  await send(conv, "one");
  await until("first turn", () => turnsOf(conv.id).some((t) => t.status === "done"));
  await send(conv, "two");
  await until("second turn", () => turnsOf(conv.id).filter((t) => t.status === "done").length === 2);
  const [a, b] = turnsOf(conv.id);
  assert.equal(a!.output, "got: one");
  assert.equal(b!.output, "got: two");
  assert.equal(spawns() - before, 1, "the idle process took it: no respawn");
  assert.ok(Math.abs(b!.cost - 0.01) < 1e-9, `a turn costs what it added, not the process total (got ${b!.cost})`);
  assert.equal(b!.sessionId, "sess-new");
});

test("a background sub-agent keeps the process busy, and its report is a turn of its own", async () => {
  const conv = fresh("bg");
  const from = events.length;
  await send(conv, "BG");
  await until("the report turn", () => turnsOf(conv.id).filter((t) => t.status === "done").length === 2);
  const opened = events.slice(from).filter((e): e is Extract<SessionEvent, { type: "turnOpened" }> => e.type === "turnOpened" && e.convId === conv.id);
  assert.equal(opened.length, 2);
  assert.equal(opened[1]!.inputId, null, "the CLI started it");
  assert.equal(opened[1]!.origin, "system");
  assert.equal(opened[1]!.prompt, "dig finished");
  const firstIdle = events.findIndex((e, i) => i >= from && e.type === "idle" && e.convId === conv.id);
  const reportOpened = events.findIndex((e, i) => i >= from && e === opened[1]);
  assert.ok(firstIdle === -1 || firstIdle > reportOpened, "not idle while the sub-agent ran");
  assert.equal(turnsOf(conv.id)[1]!.output, "the dig is done");
});

test("Stop ends the turn as stopped and keeps the process: the next message needs no respawn", async () => {
  const conv = fresh("stop");
  const before = spawns();
  await send(conv, "SLOW");
  const opened = await until("turn", () => events.find((e): e is Extract<SessionEvent, { type: "turnOpened" }> => e.type === "turnOpened" && e.convId === conv.id));
  assert.equal(abortRun(opened.runId), true);
  await until("stopped", () => turnsOf(conv.id)[0]?.status === "error");
  assert.equal(turnsOf(conv.id)[0]!.errorCode, "stopped");
  await send(conv, "after");
  await until("next turn", () => turnsOf(conv.id)[1]?.status === "done");
  assert.equal(turnsOf(conv.id)[1]!.output, "got: after");
  assert.equal(spawns() - before, 1);
});

test("a process that dies before reading leaves a failed turn that says why, and is not restarted", async () => {
  const conv = fresh("crash");
  const before = spawns();
  const from = events.length;
  await send(conv, "CRASH");
  await until("exit", () => events.slice(from).some((e) => e.type === "exited" && e.convId === conv.id));
  const [turn] = turnsOf(conv.id);
  assert.equal(turn?.status, "error");
  assert.equal(turn?.prompt, "CRASH");
  assert.equal(turn?.errorCode, "auth_expired");
  assert.equal(db.listPendingInputs(conv.id).length, 0, "the message became the failed turn");
  await new Promise((r) => setTimeout(r, 100));
  assert.equal(spawns() - before, 1);
  assert.equal(chat.hasLiveProcess(conv.id), false);
});

test("a session the account no longer has starts fresh with the same message, and says so", async () => {
  const conv = fresh("dead");
  db.updateConversation(conv.id, { sessionId: "dead" });
  await send({ ...conv, sessionId: "dead" }, "hello");
  await until("answer", () => turnsOf(conv.id)[0]?.status === "done");
  const [turn] = turnsOf(conv.id);
  assert.match(turn!.output, /Previous session not found/);
  assert.match(turn!.output, /got: hello/);
  assert.equal(turn!.sessionId, "sess-new");
});

test("a seat's idle process makes way for a one-shot run; a working one does not", async () => {
  const conv = fresh("seat");
  await send(conv, "SLOW");
  await until("turn", () => chat.openTurnId(conv.id));
  assert.equal(await chat.releaseIdleSeat("dev", "seat"), false);
  await until("idle", () => !chat.isBusy(conv.id));
  assert.equal(await chat.releaseIdleSeat("dev", "seat"), true);
  assert.equal(chat.hasLiveProcess(conv.id), false);
});

