/**
 * Locks the async-`Task` protocol of CLI >= 2.1.278. The fixtures are verbatim
 * lines from a real `claude -p --agent developer --output-format stream-json`
 * run that spawned `qa-code-review` — reproduce with the probe in
 * `NEXT_SESSION.md`. Before this was handled, every sub-agent card settled
 * `done` in ~50ms with the launch receipt as its output.
 */
import assert from "node:assert";
import { test } from "node:test";
import {
  detectSubAgentSpawn,
  isAsyncTaskLaunchAck,
  parseTaskNotification,
  parseTaskStarted,
} from "./subagent-parse";

const LAUNCH_ACK = `Async agent launched successfully. (This tool result is internal metadata — never quote or paste any part of it, including the agentId below, into a user-facing reply.)
agentId: a761b5414f2a674c3 (internal ID - do not mention to user. Use SendMessage with to: 'a761b5414f2a674c3', summary: '<5-10 word recap>' to continue this agent.)
The agent is working in the background. You will be notified automatically when it completes.
output_file: /tmp/claude-1000/-tmp/6220b8bf/tasks/a761b5414f2a674c3.output`;

const TASK_STARTED = {
  type: "system",
  subtype: "task_started",
  task_id: "a36aa725e0a5ccd55",
  tool_use_id: "toolu_01Sf2dLwyvVs6JCBUZ2DidKL",
  description: "ping",
  subagent_type: "qa-code-review",
  is_backgrounded: true,
  spawn_depth: 1,
  task_type: "local_agent",
  prompt: "reply with the single word PONG and stop",
  session_id: "fb4567e9-972e-4ed5-86b6-5c69f508eb19",
};

const TASK_NOTIFICATION = {
  type: "system",
  subtype: "task_notification",
  task_id: "a36aa725e0a5ccd55",
  tool_use_id: "toolu_01Sf2dLwyvVs6JCBUZ2DidKL",
  status: "completed",
  output_file: "/tmp/claude-1000/-tmp/fb4567e9/tasks/a36aa725e0a5ccd55.output",
  summary: "PONG",
  usage: { total_tokens: 8222, tool_uses: 0, duration_ms: 1427 },
  session_id: "fb4567e9-972e-4ed5-86b6-5c69f508eb19",
};

test("the launch receipt is recognised, real sub-agent output is not", () => {
  assert.equal(isAsyncTaskLaunchAck(LAUNCH_ACK), true);
  assert.equal(isAsyncTaskLaunchAck("MUST-FIX: unguarded path.join in route.ts"), false);
  assert.equal(isAsyncTaskLaunchAck(""), false);
  assert.equal(
    isAsyncTaskLaunchAck("The report mentions Async agent launched successfully somewhere"),
    false,
    "only a leading match is the receipt — a child may quote the phrase",
  );
});

test("task_started yields the correlation keys and the async flag", () => {
  assert.deepEqual(parseTaskStarted(TASK_STARTED), {
    taskId: "a36aa725e0a5ccd55",
    toolUseId: "toolu_01Sf2dLwyvVs6JCBUZ2DidKL",
    subagentType: "qa-code-review",
    backgrounded: true,
  });
});

test("a synchronous spawn is not flagged backgrounded", () => {
  const sync = parseTaskStarted({ ...TASK_STARTED, is_backgrounded: false });
  assert.equal(sync?.backgrounded, false);
});

test("task_notification is the completion signal", () => {
  assert.deepEqual(parseTaskNotification(TASK_NOTIFICATION), {
    taskId: "a36aa725e0a5ccd55",
    toolUseId: "toolu_01Sf2dLwyvVs6JCBUZ2DidKL",
    status: "done",
    summary: "PONG",
    durationMs: 1427,
    outputFile: "/tmp/claude-1000/-tmp/fb4567e9/tasks/a36aa725e0a5ccd55.output",
  });
});

test("terminal statuses map, an unknown one never reads as success", () => {
  const statusFor = (status: string) =>
    parseTaskNotification({ ...TASK_NOTIFICATION, status })?.status;
  assert.equal(statusFor("completed"), "done");
  assert.equal(statusFor("cancelled"), "cancelled");
  assert.equal(statusFor("timed_out"), "timeout");
  assert.equal(statusFor("failed"), "error");
  assert.equal(statusFor("some_future_state"), "error");
});

test("a progress notification does not settle the card", () => {
  for (const status of ["running", "pending", "queued", "in_progress"]) {
    assert.equal(parseTaskNotification({ ...TASK_NOTIFICATION, status }), null, status);
  }
});

test("the two task events never match each other or ordinary stream lines", () => {
  assert.equal(parseTaskStarted(TASK_NOTIFICATION), null);
  assert.equal(parseTaskNotification(TASK_STARTED), null);
  for (const evt of [
    { type: "system", subtype: "init", tools: ["Task"] },
    { type: "system", subtype: "background_tasks_changed" },
    { type: "system", subtype: "task_updated", patch: { status: "completed" } },
    { type: "result", subtype: "success", result: "PONG" },
    { type: "system", subtype: "task_started" },
    null,
    "task_notification",
    [TASK_NOTIFICATION],
  ]) {
    assert.equal(parseTaskStarted(evt), null, JSON.stringify(evt));
    assert.equal(parseTaskNotification(evt), null, JSON.stringify(evt));
  }
});

test("the spawn itself is still detected from the tool call", () => {
  assert.deepEqual(
    detectSubAgentSpawn("Task", { description: "ping", subagent_type: "qa-code-review", prompt: "review the diff" }, "developer"),
    { agentId: "qa-code-review", prompt: "review the diff" },
  );
});
