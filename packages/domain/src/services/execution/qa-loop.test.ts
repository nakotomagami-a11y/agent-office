/**
 * The "QA loop" toggle: when a finished chat turn becomes a review loop, and —
 * just as important — every case where it must NOT, since each false start is
 * a paid review nobody asked for.
 *
 * Runs against a throwaway $HOME sandbox — never touches real data.
 */
import assert from "node:assert";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

const sandbox = mkdtempSync(join(tmpdir(), "ao-qaloop-"));
process.env.HOME = sandbox;
process.env.USERPROFILE = sandbox; // os.homedir() reads this on Windows, not HOME
const claudeDir = join(sandbox, ".claude");
const projectsRoot = join(sandbox, "root");
mkdirSync(join(claudeDir, "agent-office"), { recursive: true });
mkdirSync(join(claudeDir, "agents"), { recursive: true });
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
const reviewerFile = join(claudeDir, "agents", "qa-code-review.md");
const installReviewer = (mode: string) =>
  writeFileSync(reviewerFile, `---\nname: qa-code-review\npermission-mode: ${mode}\n---\nReview.\n`);
installReviewer("bypassPermissions");

const { maybeStartQaLoop } = await import("./qa-loop");
const db = await import("../db/index");
import type { LoopRunner } from "./loop-runner";

const dispatched: Array<{ agentId: string; prompt: string; conversationId?: string | null }> = [];
let n = 0;
const runner: LoopRunner = {
  startRun: async (i) => { dispatched.push(i); return `loop-round-${++n}`; },
  costOf: () => 0,
  ruleExists: () => true,
  ruleIds: () => ["general.correctness"],
  findingsFor: () => [],
};

let seq = 0;
function turn(opts: {
  instanceId?: string; tool?: string; conversationId?: string | null; origin?: "user" | "system";
} = {}): string {
  const id = `turn-${++seq}`;
  const instanceId = opts.instanceId ?? "dev-on";
  const conversationId = opts.conversationId === null
    ? undefined
    : (opts.conversationId ?? db.startNewConversation("developer", instanceId, "proj").id);
  db.insertRun({
    id, agentId: "developer", agentName: "Developer", instanceId, origin: opts.origin,
    projectId: "proj", status: "done", prompt: "add a login page", model: "opus", effort: "high",
    cwd: join(projectsRoot, "proj"), startedAt: seq, conversationId,
  });
  if (opts.tool) db.insertToolCall(id, opts.tool, { file_path: "src/login.ts" }, seq);
  return id;
}

test("a user turn that edited files, with the toggle on, starts a loop at REVIEW", async () => {
  const before = dispatched.length;
  const id = await maybeStartQaLoop(turn({ tool: "Edit" }), true, runner, 1);
  assert.ok(id);
  const loop = db.getLoop(id)!;
  assert.equal(loop.state.phase, "reviewing", "the chat already did the work: no authoring round");
  assert.equal(loop.reviewerAgentId, "qa-code-review");
  assert.match(loop.goal, /^add a login page/);
  assert.match(loop.goal, /src\/login\.ts/, "the reviewer is told which files the turn touched");
  assert.equal(dispatched.length, before + 1);
  assert.equal(dispatched.at(-1)!.agentId, "qa-code-review", "round 1 goes to the reviewer, not the author");
  assert.equal(dispatched.at(-1)!.conversationId, null, "the reviewer is not a chat turn");
  assert.match(dispatched.at(-1)!.prompt, /general\.correctness/);
});

test("no loop: toggle off, no edits, failed turn, no conversation, or a system turn", async () => {
  const before = dispatched.length;
  assert.equal(await maybeStartQaLoop(turn({ instanceId: "dev-off", tool: "Edit" }), true, runner, 1), null, "toggle off");
  assert.equal(await maybeStartQaLoop(turn({ tool: "Read" }), true, runner, 1), null, "read-only turn");
  assert.equal(await maybeStartQaLoop(turn({ tool: "Edit" }), false, runner, 1), null, "failed turn");
  assert.equal(await maybeStartQaLoop(turn({ tool: "Edit", conversationId: null }), true, runner, 1), null,
    "a reviewer round carries no conversation");
  assert.equal(await maybeStartQaLoop(turn({ tool: "Edit", origin: "system" }), true, runner, 1), null,
    "a fix round or a shell wake must not start another loop");
  assert.equal(dispatched.length, before);
});

test("no loop while the chat has more work: a running turn or a queued message", async () => {
  const busy = db.startNewConversation("developer", "dev-on", "proj");
  const done = turn({ tool: "Edit", conversationId: busy.id });
  db.updateConversation(busy.id, { status: "running" });
  assert.equal(await maybeStartQaLoop(done, true, runner, 1), null, "a queued message already started");

  const queued = db.startNewConversation("developer", "dev-on", "proj");
  const done2 = turn({ tool: "Edit", conversationId: queued.id });
  db.replaceQueue(queued.id, [{ id: "qa-queued", text: "and also the logout page" }]);
  assert.equal(await maybeStartQaLoop(done2, true, runner, 1), null);
});

test("no loop when the reviewer is missing or would wait on prompts no chat shows", async () => {
  installReviewer("acceptEdits");
  assert.equal(await maybeStartQaLoop(turn({ tool: "Edit" }), true, runner, 1), null);
  rmSync(reviewerFile);
  assert.equal(await maybeStartQaLoop(turn({ tool: "Edit" }), true, runner, 1), null);
  installReviewer("bypassPermissions");
});

test("a second turn in the same chat does not start a second loop while one is live", async () => {
  const shared = db.startNewConversation("developer", "dev-on", "proj").id;
  const first = await maybeStartQaLoop(turn({ tool: "Edit", conversationId: shared }), true, runner, 1);
  assert.ok(first);
  assert.equal(await maybeStartQaLoop(turn({ tool: "Edit", conversationId: shared }), true, runner, 2), null);

  db.updateLoopState(first, { ...db.getLoop(first)!.state, phase: "done", binding: "converged" }, null, 3);
  assert.ok(await maybeStartQaLoop(turn({ tool: "Edit", conversationId: shared }), true, runner, 4),
    "once settled, the next edit turn gets its own loop");
});

test("the header shows a live loop first, then one waiting on the user, then the newest", async () => {
  db.getDb().prepare(`UPDATE loops SET phase='done', binding='converged', created_at=0`).run();
  const conv = () => db.startNewConversation("developer", "dev-on", "proj").id;
  const waiting = (await maybeStartQaLoop(turn({ tool: "Edit", conversationId: conv() }), true, runner, 10))!;
  db.updateLoopState(waiting, { ...db.getLoop(waiting)!.state, phase: "escalated", binding: "max_rounds" }, null, 11);
  const converged = (await maybeStartQaLoop(turn({ tool: "Edit", conversationId: conv() }), true, runner, 12))!;
  db.updateLoopState(converged, { ...db.getLoop(converged)!.state, phase: "done", binding: "converged" }, null, 13);
  assert.equal(db.latestLoopForInstance("proj", "dev-on")!.id, waiting, "a newer pass must not hide an open decision");

  const live = await maybeStartQaLoop(turn({ tool: "Edit", conversationId: conv() }), true, runner, 14);
  assert.equal(db.latestLoopForInstance("proj", "dev-on")!.id, live);
  assert.equal(db.latestLoopForInstance("proj", "dev-off"), null);
  assert.equal(db.latestLoopForInstance("other", "dev-on"), null, "scoped to the project");
});

test("a fix round never pushes into a busy chat: it is refused as retryable and nothing is queued", async () => {
  const { productionLoopRunner } = await import("./loop-production-runner");
  const conv = db.startNewConversation("developer", "dev-on", "proj");
  db.updateConversation(conv.id, { status: "running", activeRunId: "users-own-turn" });
  await assert.rejects(
    productionLoopRunner.startRun({
      agentId: "developer", instanceId: "dev-on", projectId: "proj", cwd: null, prompt: "Round 2. Fix", conversationId: conv.id,
    }),
    (e: Error & { code?: string }) => e.code === "already_running",
  );
  assert.equal(db.listQueue(conv.id).length, 0, "the user's queue is untouched");
  assert.equal(db.getConversation(conv.id)!.activeRunId, "users-own-turn", "the user's turn is untouched");
});

const down = { ok: false as const, error: { status: 503, code: "claude_unavailable", message: "down" } };
const failingRunner = {
  deliver: async () => down,
  redeliver: async () => down,
  isBusy: () => false,
  hasLiveProcess: () => false,
  close: async () => {},
};

test("startTurnIfIdle: a failed start leaves the user's chat idle, not parked over a turn they never sent", async () => {
  const conversation = await import("./conversation");
  const conv = db.startNewConversation("developer", "dev-on", "proj");
  const r = await conversation.startTurnIfIdle(conv.id, "Round 2. Fix", "system", failingRunner);
  assert.deepEqual(r, { code: "claude_unavailable" }, "the real code survives, so the loop can retry");
  assert.equal(db.getConversation(conv.id)!.status, "idle");
  assert.equal(db.listQueue(conv.id).length, 0);
});

test("after Resume, the goal is the user's last real request, not the canned resume prompt", async () => {
  const { RESUME_PROMPT } = await import("./conversation-machine");
  const conv = db.startNewConversation("developer", "dev-on", "proj").id;
  db.insertRun({
    id: "asked-1", agentId: "developer", agentName: "Developer", instanceId: "dev-on", projectId: "proj",
    status: "error", prompt: "build the settings page", model: "m", effort: "e", startedAt: 1000, conversationId: conv,
  });
  db.insertRun({
    id: "resumed-1", agentId: "developer", agentName: "Developer", instanceId: "dev-on", projectId: "proj",
    status: "done", prompt: RESUME_PROMPT, model: "m", effort: "e", startedAt: 1001, conversationId: conv,
    cwd: join(projectsRoot, "proj"),
  });
  db.insertToolCall("resumed-1", "Write", { file_path: "settings.ts" }, 1001);
  const id = await maybeStartQaLoop("resumed-1", true, runner, 20);
  assert.match(db.getLoop(id!)!.goal, /^build the settings page/);
});

test("the pill ranks a STOPPED or failed loop like a finished one, not above it", async () => {
  db.getDb().prepare(`UPDATE loops SET phase='done', binding='converged', created_at=0`).run();
  const conv = () => db.startNewConversation("developer", "dev-on", "proj").id;
  const stopped = (await maybeStartQaLoop(turn({ tool: "Edit", conversationId: conv() }), true, runner, 30))!;
  db.updateLoopState(stopped, { ...db.getLoop(stopped)!.state, phase: "escalated", binding: "user_stopped" }, null, 31);
  const passed = (await maybeStartQaLoop(turn({ tool: "Edit", conversationId: conv() }), true, runner, 32))!;
  db.updateLoopState(passed, { ...db.getLoop(passed)!.state, phase: "done", binding: "converged" }, null, 33);
  assert.equal(db.latestLoopForInstance("proj", "dev-on")!.id, passed);
});

test("an agent message whose start fails waits at the head of the queue, not lost", async () => {
  const conversation = await import("./conversation");
  const conv = db.startNewConversation("developer", "dev-on", "proj");
  await conversation.sendMessageToConversation(conv.id, "review findings", failingRunner, undefined, "system");
  assert.equal(db.getConversation(conv.id)!.status, "needs_attention");
  assert.deepEqual(db.listQueue(conv.id).map((m) => m.text), ["review findings"]);
});
