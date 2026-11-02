/**
 * DB layer for conversations + durable queue + legacy backfill. Runs against a
 * throwaway in-memory SQLite (via the getDb() global override) so it never
 * touches the real app DB.
 *
 *   pnpm --filter @agent-office/domain test src/services/db/conversations.test.ts
 */
import assert from "node:assert";
import Database from "better-sqlite3";
import { createSchema, backfillConversations } from "./migrations";
import * as convo from "./conversations";
import { insertRun, markRunAborted, updateRun } from "./runs";

const mem = new Database(":memory:");
mem.pragma("foreign_keys = ON");
createSchema(mem);
globalThis.__agentOfficeDb = mem;

let passed = 0;
function check(name: string, fn: () => void) {
  fn();
  passed++;
  console.log(`PASS  ${name}`);
}

check("create / get / ensure (ensure returns existing, not a dup)", () => {
  const c = convo.createConversation("dev", "s1", "proj", null);
  assert.equal(convo.getConversation(c.id)?.id, c.id);
  assert.equal(convo.getActiveConversation("dev", "s1")?.id, c.id);
  assert.equal(convo.ensureConversation("dev", "s1", "proj").id, c.id);
});

check("the queue keeps the order it was written in (replace / list)", () => {
  const c = convo.createConversation("dev", "q", "p", null);
  convo.replaceQueue(c.id, ["a", "b", "c"].map((t) => ({ id: `q-${t}`, text: t })));
  assert.deepEqual(convo.listQueue(c.id).map((m) => m.text), ["a", "b", "c"]);
  assert.equal(convo.queueLength(c.id), 3);
  convo.replaceQueue(c.id, convo.listQueue(c.id).slice(2));
  assert.deepEqual(convo.listQueue(c.id).map((m) => m.text), ["c"]);
});

check("remove and clear queue", () => {
  const c = convo.createConversation("dev", "q2", "p", null);
  convo.replaceQueue(c.id, [{ id: "q2-x", text: "x" }, { id: "q2-y", text: "y" }]);
  convo.removeQueuedMessage(c.id, "q2-x");
  assert.deepEqual(convo.listQueue(c.id).map((m) => m.text), ["y"]);
  convo.clearQueue(c.id);
  assert.equal(convo.queueLength(c.id), 0);
});

check("queues are isolated per conversation", () => {
  const a = convo.createConversation("dev", "iso-a", "p", null);
  const b = convo.createConversation("dev", "iso-b", "p", null);
  convo.replaceQueue(a.id, [{ id: "iso-only-a", text: "only-a" }]);
  assert.equal(convo.queueLength(a.id), 1);
  assert.equal(convo.queueLength(b.id), 0); // sibling instance cannot see it
});

check("updateConversation patches status / activeRunId / sessionId", () => {
  const c = convo.createConversation("dev", "u", "p", null);
  convo.updateConversation(c.id, { status: "running", activeRunId: "r1", sessionId: "sess" });
  const g = convo.getConversation(c.id)!;
  assert.equal(g.status, "running");
  assert.equal(g.activeRunId, "r1");
  assert.equal(g.sessionId, "sess");
});

check("listConversationTurns: top-level only, oldest-first", () => {
  const c = convo.createConversation("dev", "t", "p", null);
  insertRun({ id: "run1", agentId: "dev", agentName: "Dev", instanceId: "t", status: "done", prompt: "first", model: "", effort: "", startedAt: 1000, conversationId: c.id });
  insertRun({ id: "run2", agentId: "dev", agentName: "Dev", instanceId: "t", status: "done", prompt: "second", model: "", effort: "", startedAt: 2000, conversationId: c.id });
  insertRun({ id: "sub", agentId: "dev", agentName: "Dev", instanceId: "t", status: "done", prompt: "child", model: "", effort: "", startedAt: 1500, parentRunId: "run1", conversationId: c.id });
  assert.deepEqual(convo.listConversationTurns(c.id).map((t) => t.prompt), ["first", "second"]);
  assert.equal(convo.latestConversationTurn(c.id)?.prompt, "second");
});

check("currentConversationFirstPrompts: first top-level prompt of the CURRENT conversation only", () => {
  const old = convo.createConversation("dev", "topic", "p", null);
  insertRun({ id: "tp-old", agentId: "dev", agentName: "Dev", instanceId: "topic", status: "done", prompt: "old thread", model: "", effort: "", startedAt: 100, conversationId: old.id });
  const cur = convo.startNewConversation("dev", "topic", "p");
  insertRun({ id: "tp-sys", agentId: "dev", agentName: "Dev", instanceId: "topic", status: "done", prompt: "You hold seat qa…", model: "", effort: "", startedAt: 120, conversationId: cur.id, origin: "system" });
  insertRun({ id: "tp-2", agentId: "dev", agentName: "Dev", instanceId: "topic", status: "done", prompt: "second", model: "", effort: "", startedAt: 300, conversationId: cur.id });
  insertRun({ id: "tp-1", agentId: "dev", agentName: "Dev", instanceId: "topic", status: "done", prompt: "new thread", model: "", effort: "", startedAt: 200, conversationId: cur.id });
  insertRun({ id: "tp-sub", agentId: "dev", agentName: "Dev", instanceId: "topic", status: "done", prompt: "child", model: "", effort: "", startedAt: 150, parentRunId: "tp-1", conversationId: cur.id });
  convo.createConversation("dev", "empty", "p", null);
  const got = convo.currentConversationFirstPrompts([{ agentId: "dev", instanceId: "topic" }, { agentId: "dev", instanceId: "empty" }]);
  assert.equal(got.get("topic"), "new thread");
  assert.equal(got.has("empty"), false, "a conversation with no runs has no topic");
});

check("listConversationTurns: surfaces a run_in_background Bash command by run, oldest tool_call wins", () => {
  const c = convo.createConversation("dev", "bg", "p", null);
  insertRun({ id: "bgrun1", agentId: "dev", agentName: "Dev", instanceId: "bg", status: "done", prompt: "start a server", model: "", effort: "", startedAt: 1000, conversationId: c.id });
  insertRun({ id: "bgrun2", agentId: "dev", agentName: "Dev", instanceId: "bg", status: "done", prompt: "no background task here", model: "", effort: "", startedAt: 2000, conversationId: c.id });
  // A normal (non-backgrounded) Bash call must not be picked up.
  mem.prepare("INSERT INTO tool_calls (id, run_id, name, input, ts) VALUES (?,?,?,?,?)")
    .run("tc0", "bgrun1", "Bash", JSON.stringify({ command: "ls" }), 1100);
  // Two backgrounded calls on the same run — the earlier one (by ts) wins.
  mem.prepare("INSERT INTO tool_calls (id, run_id, name, input, ts) VALUES (?,?,?,?,?)")
    .run("tc1", "bgrun1", "Bash", JSON.stringify({ command: "sleep 240", run_in_background: true }), 1200);
  mem.prepare("INSERT INTO tool_calls (id, run_id, name, input, ts) VALUES (?,?,?,?,?)")
    .run("tc2", "bgrun1", "Bash", JSON.stringify({ command: "sleep 300", run_in_background: true }), 1300);

  const turns = convo.listConversationTurns(c.id);
  const t1 = turns.find((t) => t.id === "bgrun1")!;
  const t2 = turns.find((t) => t.id === "bgrun2")!;
  assert.equal(t1.backgroundTaskCommand, "sleep 240");
  assert.equal(t2.backgroundTaskCommand, undefined, "a turn with no run_in_background tool_call gets no field at all");
});

check("listConversationTurns: attaches the full tool-call trail, oldest-first", () => {
  const c = convo.createConversation("dev", "tc", "p", null);
  insertRun({ id: "tcrun1", agentId: "dev", agentName: "Dev", instanceId: "tc", status: "done", prompt: "do things", model: "", effort: "", startedAt: 1000, conversationId: c.id });
  insertRun({ id: "tcrun2", agentId: "dev", agentName: "Dev", instanceId: "tc", status: "done", prompt: "no tools", model: "", effort: "", startedAt: 2000, conversationId: c.id });
  // Inserted out of ts order — the read must sort them oldest-first.
  mem.prepare("INSERT INTO tool_calls (id, run_id, name, input, ts) VALUES (?,?,?,?,?)")
    .run("t-b", "tcrun1", "Grep", JSON.stringify({ pattern: "foo" }), 1200);
  mem.prepare("INSERT INTO tool_calls (id, run_id, name, input, ts) VALUES (?,?,?,?,?)")
    .run("t-a", "tcrun1", "Bash", JSON.stringify({ command: "ls" }), 1100);

  const turns = convo.listConversationTurns(c.id);
  const t1 = turns.find((t) => t.id === "tcrun1")!;
  const t2 = turns.find((t) => t.id === "tcrun2")!;
  assert.deepEqual(
    t1.toolCalls,
    [
      { id: "t-a", name: "Bash", input: JSON.stringify({ command: "ls" }), ts: 1100 },
      { id: "t-b", name: "Grep", input: JSON.stringify({ pattern: "foo" }), ts: 1200 },
    ],
    "full trail attached in ts order",
  );
  assert.equal(t2.toolCalls, undefined, "a turn with no tool_calls gets no field");
});

check("backfill creates a conversation per legacy slot and tags its runs", () => {
  // v31 empties the legacy table; backfill only ever runs at v14, where it still holds rows.
  mem.exec(`CREATE TABLE IF NOT EXISTS transcripts (agent_id TEXT NOT NULL, instance_id TEXT NOT NULL, items TEXT NOT NULL DEFAULT '[]',
    active_run_id TEXT, session_id TEXT, updated_at INTEGER NOT NULL, queued_messages TEXT NOT NULL DEFAULT '[]',
    PRIMARY KEY(agent_id, instance_id))`);
  mem.prepare("INSERT INTO transcripts (agent_id, instance_id, items, active_run_id, session_id, queued_messages, updated_at) VALUES (?,?,?,?,?,?,?)")
    .run("legacy", "default", "[]", null, "legacy-session", "[]", 5000);
  insertRun({ id: "lrun1", agentId: "legacy", agentName: "L", instanceId: "default", status: "done", prompt: "old-1", model: "", effort: "", startedAt: 100 });
  insertRun({ id: "lrun2", agentId: "legacy", agentName: "L", instanceId: "default", status: "done", prompt: "old-2", model: "", effort: "", startedAt: 200 });

  backfillConversations(mem);

  const c = convo.getActiveConversation("legacy", "default");
  assert.ok(c, "conversation created for legacy slot");
  assert.equal(c!.sessionId, "legacy-session", "carries the transcript session");
  assert.deepEqual(convo.listConversationTurns(c!.id).map((t) => t.prompt), ["old-1", "old-2"]);

  // Idempotent: a second run neither duplicates the conversation nor re-tags.
  backfillConversations(mem);
  assert.equal(convo.getActiveConversation("legacy", "default")!.id, c!.id);
  assert.equal(convo.listConversationTurns(c!.id).length, 2);
});

check("origin survives a queue rewrite, which is every state transition", () => {
  // `replaceQueue` is how the conversation service persists state after EVERY
  // transition. Dropping origin there relabels Agent Office's own message as
  // the user's on the next tick — invisible, because the text is unchanged.
  // The drain itself is covered in conversation-machine.test.ts.
  const c = convo.createConversation("dev", "origin-rw", null, null);
  convo.replaceQueue(c.id, [{ id: "rw-mine", text: "mine" }, { id: "rw-wake", text: "wake", origin: "system" }]);
  const before = convo.listQueue(c.id);
  assert.deepEqual(before.map((m) => m.origin), ["user", "system"]);

  convo.replaceQueue(c.id, before.map((m) => ({ id: m.id, text: m.text, origin: m.origin })));
  assert.deepEqual(
    convo.listQueue(c.id).map((m) => m.origin),
    ["user", "system"],
    "a rewrite must not relabel who wrote the message",
  );
});

check("rows written before the origin column default to the user", () => {
  // The migration backfills 'user'. That is true for every pre-existing row:
  // only the reply box could write one.
  const c = convo.createConversation("dev", "origin-old", null, null);
  mem.prepare(
    "INSERT INTO queued_messages (id, conversation_id, text, attachments, position, created_at) VALUES (?, ?, ?, NULL, 0, 0)",
  ).run("legacy1", c.id, "typed by hand");
  assert.equal(convo.listQueue(c.id)[0]?.origin, "user");
});

check("a failed turn keeps its error code + detail through the conversation read path", () => {
  const c = convo.createConversation("dev", "err", null, null);
  insertRun({ id: "errrun", agentId: "dev", agentName: "Dev", instanceId: "err", status: "running", prompt: "p", model: "", effort: "", startedAt: 1, conversationId: c.id });
  updateRun("errrun", {
    status: "error", exitCode: 1, output: "", tokensIn: 0, tokensOut: 0, costUsd: 0, durMs: 5, endedAt: 6,
    errorCode: "unknown", errorDetail: "Claude CLI exited with code 1: boom",
  });
  const turn = convo.listConversationTurns(c.id)[0];
  assert.equal(turn?.errorCode, "unknown");
  assert.equal(turn?.errorDetail, "Claude CLI exited with code 1: boom");
  assert.equal(convo.latestConversationTurn(c.id)?.errorDetail, "Claude CLI exited with code 1: boom");
});

check("a stopped run records why, even when the CLI never reported", () => {
  const c = convo.createConversation("dev", "stop", null, null);
  insertRun({ id: "stoprun", agentId: "dev", agentName: "Dev", instanceId: "stop", status: "running", prompt: "p", model: "", effort: "", startedAt: 1, conversationId: c.id });
  markRunAborted("stoprun", "stopped");
  assert.equal(convo.latestConversationTurn(c.id)?.errorCode, "stopped");
});

// B5: sub-agent runs are rows with parent_run_id; the turn view never attached them.
check("each turn carries its own sub-agent runs, and only its own", () => {
  const c = convo.createConversation("dev", "subs", "p", null);
  const other = convo.createConversation("dev", "subs2", "p", null);
  const base = { agentId: "dev", agentName: "Dev", status: "done", model: "", effort: "" };
  insertRun({ ...base, id: "turnA", prompt: "a", startedAt: 100, conversationId: c.id });
  insertRun({ ...base, id: "turnB", prompt: "b", startedAt: 200, conversationId: c.id });
  insertRun({ ...base, id: "turnX", prompt: "x", startedAt: 150, conversationId: other.id });
  insertRun({ ...base, id: "subA2", agentId: "qa", prompt: "second", startedAt: 120, parentRunId: "turnA" });
  insertRun({ ...base, id: "subA1", agentId: "qa", prompt: "first", startedAt: 110, parentRunId: "turnA" });
  insertRun({ ...base, id: "subX", agentId: "qa", prompt: "elsewhere", startedAt: 160, parentRunId: "turnX" });
  updateRun("subA1", { status: "done", exitCode: 0, output: "ok", tokensIn: 0, tokensOut: 0, costUsd: 0, durMs: 900, endedAt: 1010 });
  const turns = convo.listConversationTurns(c.id);
  assert.deepEqual(turns.map((t) => t.id), ["turnA", "turnB"], "sub-runs are not turns");
  assert.deepEqual(turns[0]!.subRuns?.map((s) => [s.id, s.prompt, s.ts]), [["subA1", "first", 110], ["subA2", "second", 120]]);
  assert.equal(turns[0]!.subRuns?.[0]!.durMs, 900);
  assert.equal(turns[1]!.subRuns, undefined);
  updateRun("subA2", { status: "error", exitCode: 1, output: "", tokensIn: 0, tokensOut: 0, costUsd: 0, durMs: 5, endedAt: 125, errorCode: "stopped" });
  assert.equal(convo.listConversationTurns(c.id)[0]!.subRuns?.[1]!.status, "cancelled", "a swept sub-agent reads as cancelled, not failed");
});

console.log(`\n${passed} passed`);
