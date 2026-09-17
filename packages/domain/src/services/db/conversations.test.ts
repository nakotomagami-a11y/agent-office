/**
 * DB layer for conversations + durable queue + legacy backfill. Runs against a
 * throwaway in-memory SQLite (via the getDb() global override) so it never
 * touches the real app DB.
 *
 *   npx tsx packages/domain/src/services/db/conversations.test.ts
 */
import assert from "node:assert";
import Database from "better-sqlite3";
import { createSchema, backfillConversations } from "./migrations";
import * as convo from "./conversations";
import { insertRun } from "./runs";

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

check("queue is strict FIFO (enqueue / list / dequeue)", () => {
  const c = convo.createConversation("dev", "q", "p", null);
  convo.enqueueMessage(c.id, "a");
  convo.enqueueMessage(c.id, "b");
  convo.enqueueMessage(c.id, "c");
  assert.deepEqual(convo.listQueue(c.id).map((m) => m.text), ["a", "b", "c"]);
  assert.equal(convo.queueLength(c.id), 3);
  assert.equal(convo.dequeueMessage(c.id)?.text, "a");
  assert.equal(convo.dequeueMessage(c.id)?.text, "b");
  assert.deepEqual(convo.listQueue(c.id).map((m) => m.text), ["c"]);
});

check("remove and clear queue", () => {
  const c = convo.createConversation("dev", "q2", "p", null);
  const m1 = convo.enqueueMessage(c.id, "x");
  convo.enqueueMessage(c.id, "y");
  convo.removeQueuedMessage(c.id, m1.id);
  assert.deepEqual(convo.listQueue(c.id).map((m) => m.text), ["y"]);
  convo.clearQueue(c.id);
  assert.equal(convo.queueLength(c.id), 0);
});

check("queues are isolated per conversation", () => {
  const a = convo.createConversation("dev", "iso-a", "p", null);
  const b = convo.createConversation("dev", "iso-b", "p", null);
  convo.enqueueMessage(a.id, "only-a");
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

console.log(`\n${passed} passed`);
