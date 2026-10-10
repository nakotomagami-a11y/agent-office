/**
 * The live SSE path and the rebuild-from-persisted path must produce byte-identical
 * tool rows. They had drifted — live formatted the arg and suppressed sub-agent
 * spawns, the rebuild did neither — so the same call rendered differently once a
 * run finished, which is what made the thread jump.
 *
 *   pnpm --filter @agent-office/web test
 */
import assert from "node:assert";
import { test } from "node:test";
import { applyToolEvent, formatToolArg, isSubAgentSpawnTool, parseStoredToolInput } from "./tool-item";
import type { ThreadItem } from "@agent-office/domain/types";

/** What the live path renders (input arrives already parsed). */
const live = (input: unknown) => formatToolArg(input);
/** What the rebuild renders (input arrives as the stored JSON string). */
const rebuilt = (input: unknown) => formatToolArg(parseStoredToolInput(JSON.stringify(input)));

test("both paths render the same arg for ordinary calls", () => {
  for (const input of [
    { command: "pnpm test" },
    { file_path: "/x/y.ts" },
    { pattern: "TODO", path: "src" },
    { command: "git status --porcelain" },
  ]) {
    assert.equal(live(input), rebuilt(input), `diverged for ${JSON.stringify(input)}`);
  }
});

test("an empty arg renders as nothing in both paths", () => {
  assert.equal(live({}), undefined);
  assert.equal(rebuilt({}), undefined);
  assert.equal(live([]), undefined);
});

test("a stored arg that is not JSON survives verbatim", () => {
  assert.equal(formatToolArg(parseStoredToolInput("plain text")), "plain text");
  assert.equal(formatToolArg(parseStoredToolInput("{not json")), "{not json");
});

test("an empty stored arg renders as nothing", () => {
  assert.equal(formatToolArg(parseStoredToolInput("")), undefined);
  assert.equal(formatToolArg(parseStoredToolInput("   ")), undefined);
});

test("sub-agent spawns are detected so both paths can suppress them", () => {
  assert.equal(isSubAgentSpawnTool("Task", { prompt: "x" }), true, "native Task");
  assert.equal(isSubAgentSpawnTool("Agent", {}), true, "native Agent");
  assert.equal(isSubAgentSpawnTool("X", { subagent_type: "dev" }), true, "by shape");
  assert.equal(isSubAgentSpawnTool("X", { description: "d", prompt: "p" }), true, "by shape");
  assert.equal(
    isSubAgentSpawnTool("Bash", { command: "claude -p --agent reviewer 'go'" }),
    true,
    "shelled-out spawn — the case subagent-parse regexes server-side",
  );
});

test("ordinary calls are NOT mistaken for spawns", () => {
  assert.equal(isSubAgentSpawnTool("Bash", { command: "pnpm test" }), false);
  assert.equal(isSubAgentSpawnTool("Bash", { command: "claude --version" }), false, "no -p/--agent");
  assert.equal(isSubAgentSpawnTool("Read", { file_path: "/a" }), false);
});

test("spawn detection agrees across both input forms", () => {
  const spawn = { subagent_type: "qa-code-review", prompt: "review" };
  assert.equal(
    isSubAgentSpawnTool("Task", spawn),
    isSubAgentSpawnTool("Task", parseStoredToolInput(JSON.stringify(spawn))),
  );
});

/**
 * The live thread used to grow TWO rows per call. The CLI reports each call
 * twice — `content_block_start`, where the input is always `{}`, then the
 * assistant message with the real input — and `applySseEvent` appended a row
 * with a fresh random id for each, so every tool showed up as a bare "Bash"
 * with no command immediately followed by the real "Bash <command>". The DB
 * layer already collapsed the pair on `tool_use_id` (see db/tool-calls.test.ts);
 * the SSE payload simply never carried the id. These tests pin the client half.
 *
 * Replay matters as much as the live pair: `attachEmit` re-emits the whole
 * event log on every reconnect and chat re-open, so the reducer has to be
 * idempotent, not merely dedupe-on-arrival.
 */
const START = (toolUseId: string, name = "Bash") => ({ runId: "r1", name, input: {}, toolUseId });
const FULL = (toolUseId: string, input: unknown, name = "Bash") => ({ runId: "r1", name, input, toolUseId });
const toolRows = (thread: ThreadItem[]) =>
  thread.filter((it): it is Extract<ThreadItem, { kind: "agent-tool" }> => it.kind === "agent-tool");

test("the two events for one call collapse into a single row", () => {
  let thread: ThreadItem[] = [];
  thread = applyToolEvent(thread, START("toolu_01"));
  thread = applyToolEvent(thread, FULL("toolu_01", { command: "pnpm test" }));

  const rows = toolRows(thread);
  assert.equal(rows.length, 1, "expected ONE row, not a bare one plus the real one");
  assert.equal(rows[0]!.name, "Bash");
  assert.deepEqual(JSON.parse(rows[0]!.arg!), { command: "pnpm test" }, "the complete input must win");
});

test("replaying the whole event log adds nothing", () => {
  const events = [START("toolu_01"), FULL("toolu_01", { command: "pnpm test" }), START("toolu_02", "Read"), FULL("toolu_02", { file_path: "/a.ts" }, "Read")];
  let thread: ThreadItem[] = [];
  for (const e of events) thread = applyToolEvent(thread, e);
  const once = thread;
  for (const e of events) thread = applyToolEvent(thread, e);

  assert.equal(toolRows(thread).length, 2);
  assert.equal(thread, once, "an idempotent replay must not even allocate a new thread");
});

test("a late empty input cannot blank out an arg already shown", () => {
  let thread = applyToolEvent([], FULL("toolu_01", { command: "pnpm build" }));
  thread = applyToolEvent(thread, START("toolu_01"));
  assert.deepEqual(JSON.parse(toolRows(thread)[0]!.arg!), { command: "pnpm build" });
});

test("distinct calls to the same tool stay distinct rows", () => {
  let thread = applyToolEvent([], FULL("toolu_01", { command: "ls" }));
  thread = applyToolEvent(thread, FULL("toolu_02", { command: "ls" }));
  assert.equal(toolRows(thread).length, 2);
});

test("a row is still created when the CLI omits the block id", () => {
  let thread = applyToolEvent([], { runId: "r1", name: "Bash", input: { command: "ls" } });
  thread = applyToolEvent(thread, { runId: "r1", name: "Bash", input: { command: "ls" } });
  assert.equal(toolRows(thread).length, 2, "without an id there is nothing to key on — append, never drop a call");
});

test("a shelled-out spawn leaves no stray row behind", () => {
  // The first fire cannot be recognised as a spawn (detection needs the
  // command), so it lands as a plain row and the second has to remove it.
  let thread = applyToolEvent([], START("toolu_01"));
  assert.equal(toolRows(thread).length, 1);
  thread = applyToolEvent(thread, FULL("toolu_01", { command: "claude -p --agent reviewer 'go'" }));
  assert.equal(toolRows(thread).length, 0, "the sub-agent card is the only row that should remain");
});

test("a native Task spawn never creates a row at all", () => {
  let thread = applyToolEvent([], { runId: "r1", name: "Task", input: {}, toolUseId: "toolu_01" });
  thread = applyToolEvent(thread, FULL("toolu_01", { subagent_type: "qa", prompt: "p" }, "Task"));
  assert.equal(toolRows(thread).length, 0);
});

test("the row id is the tool_use id, matching the rebuild-from-persisted path", () => {
  // `conversation-to-thread.ts` uses the tool_calls row id, which IS the
  // tool_use id — so a row keeps its identity (and its expanded state) when a
  // finished turn is re-rendered from the DB instead of the stream.
  const thread = applyToolEvent([], FULL("toolu_01", { command: "ls" }));
  assert.equal(toolRows(thread)[0]!.id, "toolu_01");
});
