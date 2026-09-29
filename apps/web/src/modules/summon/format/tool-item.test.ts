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
import { formatToolArg, isSubAgentSpawnTool, parseStoredToolInput } from "./tool-item";

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
