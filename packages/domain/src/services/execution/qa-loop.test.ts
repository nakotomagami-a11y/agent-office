/**
 * The "QA loop" toggle: when a finished chat turn becomes a review loop, and —
 * just as important — every case where it must NOT, since each false start is
 * a paid review nobody asked for.
 *
 * Runs against a throwaway $HOME sandbox — never touches real data.
 */
import assert from "node:assert";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

const sandbox = mkdtempSync(join(tmpdir(), "ao-qaloop-"));
process.env.HOME = sandbox;
process.env.USERPROFILE = sandbox; // os.homedir() reads this on Windows, not HOME
const claudeDir = join(sandbox, ".claude");
const projectsRoot = join(sandbox, "root");
mkdirSync(join(claudeDir, "agent-office"), { recursive: true });
mkdirSync(join(claudeDir, "projects", "proj"), { recursive: true });
mkdirSync(join(projectsRoot, "proj"), { recursive: true });
writeFileSync(
  join(claudeDir, "agent-office-settings.json"),
  JSON.stringify({ projectsRoot, excluded: [], firstRunComplete: true }),
);
writeFileSync(
  join(claudeDir, "projects", "proj", "project.md"),
  `---\nname: "Proj"\nroster:\n- instanceId: dev-on\n  agentId: developer\n  qaLoopEnabled: true\n- instanceId: dev-off\n  agentId: developer\n---\n`,
);

const { maybeStartQaLoop } = await import("./qa-loop");
const db = await import("../db/index");
import type { LoopRunner } from "./loop-runner";

const dispatched: Array<{ agentId: string; prompt: string; instanceId: string | null }> = [];
let n = 0;
const runner: LoopRunner = {
  startRun: async (i) => { dispatched.push(i); return `loop-round-${++n}`; },
  costOf: () => 0,
  ruleExists: () => true,
  ruleIds: () => ["general.correctness"],
  findingsFor: () => [],
};

let seq = 0;
function turn(opts: { instanceId?: string; tool?: string; conversationId?: string | null; parentRunId?: string; subagentTool?: string } = {}): string {
  const id = `turn-${++seq}`;
  db.insertRun({
    id, agentId: "developer", agentName: "Developer", instanceId: opts.instanceId ?? "dev-on",
    projectId: "proj", status: "done", prompt: "add a login page", model: "opus", effort: "high",
    cwd: join(projectsRoot, "proj"), startedAt: seq, parentRunId: opts.parentRunId,
    conversationId: opts.conversationId === null ? undefined : (opts.conversationId ?? `conv-${seq}`),
  });
  if (opts.tool) db.insertToolCall(id, opts.tool, { file_path: "a.ts" }, seq);
  if (opts.subagentTool) {
    const child = `${id}-sub`;
    db.insertRun({
      id: child, agentId: "developer", agentName: "Developer", instanceId: "dev-on", projectId: "proj",
      status: "done", prompt: "sub", model: "opus", effort: "high", startedAt: seq, parentRunId: id,
    });
    db.insertToolCall(child, opts.subagentTool, { file_path: "b.ts" }, seq);
  }
  return id;
}

test("a turn that edited files, with the toggle on, starts a loop at REVIEW", async () => {
  const before = dispatched.length;
  const id = await maybeStartQaLoop(turn({ tool: "Edit" }), true, runner, 1);
  assert.ok(id);
  const loop = db.getLoop(id)!;
  assert.equal(loop.state.phase, "reviewing", "the chat already did the work: no authoring round");
  assert.equal(loop.reviewerAgentId, "qa-code-review");
  assert.equal(loop.goal, "add a login page");
  assert.equal(dispatched.length, before + 1);
  assert.equal(dispatched.at(-1)!.agentId, "qa-code-review", "round 1 goes to the reviewer, not the busy author");
  assert.match(dispatched.at(-1)!.prompt, /general\.correctness/);
});

test("edits made by a sub-agent count", async () => {
  assert.ok(await maybeStartQaLoop(turn({ subagentTool: "Write" }), true, runner, 1));
});

test("no loop: toggle off, no edits, failed turn, no conversation, or a sub-agent run", async () => {
  const before = dispatched.length;
  assert.equal(await maybeStartQaLoop(turn({ instanceId: "dev-off", tool: "Edit" }), true, runner, 1), null, "toggle off");
  assert.equal(await maybeStartQaLoop(turn({ tool: "Read" }), true, runner, 1), null, "read-only turn");
  assert.equal(await maybeStartQaLoop(turn({ tool: "Edit" }), false, runner, 1), null, "failed turn");
  assert.equal(await maybeStartQaLoop(turn({ tool: "Edit", conversationId: null }), true, runner, 1), null,
    "a loop's own rounds carry no conversation and must never re-trigger");
  const parent = turn();
  assert.equal(await maybeStartQaLoop(turn({ tool: "Edit", parentRunId: parent }), true, runner, 1), null, "sub-agent run");
  assert.equal(dispatched.length, before);
});

test("a second turn in the same chat does not start a second loop while one is live", async () => {
  const first = await maybeStartQaLoop(turn({ tool: "Edit", conversationId: "conv-shared" }), true, runner, 1);
  assert.ok(first);
  assert.equal(await maybeStartQaLoop(turn({ tool: "Edit", conversationId: "conv-shared" }), true, runner, 2), null);

  db.updateLoopState(first, { ...db.getLoop(first)!.state, phase: "done", binding: "converged" }, null, 3);
  assert.ok(await maybeStartQaLoop(turn({ tool: "Edit", conversationId: "conv-shared" }), true, runner, 4),
    "once settled, the next edit turn gets its own loop");
});

test("the header finds the seat's newest loop", async () => {
  const id = await maybeStartQaLoop(turn({ tool: "Edit" }), true, runner, 5);
  assert.equal(db.latestLoopForInstance("dev-on")!.id, id);
  assert.equal(db.latestLoopForInstance("dev-off"), null);
});
