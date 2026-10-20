/**
 * Removing a session, resetting a roster or deleting an agent must never take
 * work with it unasked (S1-10, S4-4, S1-17), and a worktree that cannot be
 * repaired must fail the turn, not move it to the main checkout (S1-11).
 *
 *   pnpm --filter @agent-office/domain test src/services/projects/projects.session-removal.test.ts
 */
import assert from "node:assert";
import { test } from "node:test";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AgentInstance, AppSettings } from "../../types/index";
import type { LiveRun } from "../execution/runs/types";

const sandbox = mkdtempSync(join(tmpdir(), "ao-session-removal-"));
process.env.HOME = sandbox;
process.env.USERPROFILE = sandbox;

const claudeDir = join(sandbox, ".claude");
const projectsRoot = join(sandbox, "root");
mkdirSync(join(claudeDir, "projects"), { recursive: true });
mkdirSync(projectsRoot, { recursive: true });
writeFileSync(
  join(claudeDir, "agent-office-settings.json"),
  JSON.stringify({ projectsRoot, excluded: [], firstRunComplete: true }),
);

const projects = await import("./projects");
const { liveRuns } = await import("../execution/runs/registry");

const ON = { features: { multiInstance: true } } as unknown as AppSettings;

const git = (cwd: string, ...args: string[]): string =>
  execFileSync("git", args, { cwd, stdio: ["ignore", "pipe", "ignore"] }).toString().trim();

function gitProject(id: string): string {
  const dir = join(projectsRoot, id);
  mkdirSync(dir, { recursive: true });
  git(dir, "init", "-q");
  git(dir, "config", "user.email", "t@t.t");
  git(dir, "config", "user.name", "t");
  writeFileSync(join(dir, "README.md"), "x\n");
  writeFileSync(join(dir, ".gitignore"), ".worktrees/\n");
  git(dir, "add", "-A");
  git(dir, "commit", "-qm", "init");
  return dir;
}

/** The second instance of an agent is the one with its own worktree. */
function sessionWithWorktree(projectId: string, agentId = "developer"): AgentInstance {
  projects.addInstance(projectId, agentId, undefined, ON);
  const { instance } = projects.addInstance(projectId, agentId, undefined, ON);
  assert.ok(instance.worktree, "expected a worktree");
  return instance;
}

const hasBranch = (dir: string, branch: string) => git(dir, "branch", "--list", branch) !== "";
const rosterIds = (id: string) => projects.readProject(id)!.meta.roster.map((i) => i.instanceId);

function refusal(code: string) {
  return (e: unknown) => e instanceof projects.SessionRemovalError && e.code === code;
}

test("a clean session goes with its worktree and branch, no question asked", () => {
  const dir = gitProject("clean");
  const s = sessionWithWorktree("clean");
  projects.removeInstance("clean", s.instanceId);
  assert.ok(!rosterIds("clean").includes(s.instanceId));
  assert.ok(!existsSync(s.worktree!.basePath));
  assert.ok(!hasBranch(dir, s.worktree!.branch));
});

test("a running session is refused and nothing is touched", () => {
  gitProject("running");
  const s = sessionWithWorktree("running");
  liveRuns.set("run-1", { id: "run-1", status: "running", agentId: "reviewer", instanceId: s.instanceId } as unknown as LiveRun);
  try {
    assert.throws(() => projects.removeInstance("running", s.instanceId, "discard"), refusal("session_running"));
    assert.ok(rosterIds("running").includes(s.instanceId));
    assert.ok(existsSync(s.worktree!.basePath));
  } finally {
    liveRuns.delete("run-1");
  }
});

test("uncommitted work refuses without a choice and lists the session", () => {
  gitProject("dirty");
  const s = sessionWithWorktree("dirty");
  writeFileSync(join(s.worktree!.basePath, "work.txt"), "unsaved\n");
  assert.throws(
    () => projects.removeInstance("dirty", s.instanceId),
    (e: unknown) =>
      e instanceof projects.SessionRemovalError &&
      e.code === "session_has_work" &&
      e.sessions[0]?.instanceId === s.instanceId &&
      e.sessions[0]?.uncommitted === 1,
  );
  assert.ok(rosterIds("dirty").includes(s.instanceId));
  assert.ok(existsSync(join(s.worktree!.basePath, "work.txt")));
});

test("keep: the session leaves, a worktree with changes stays whole", () => {
  const dir = gitProject("keep-dirty");
  const s = sessionWithWorktree("keep-dirty");
  writeFileSync(join(s.worktree!.basePath, "work.txt"), "unsaved\n");
  projects.removeInstance("keep-dirty", s.instanceId, "keep");
  assert.ok(!rosterIds("keep-dirty").includes(s.instanceId));
  assert.ok(existsSync(join(s.worktree!.basePath, "work.txt")));
  assert.ok(hasBranch(dir, s.worktree!.branch));
});

test("keep: commits only on the session branch keep the branch, the clean folder goes", () => {
  const dir = gitProject("keep-ahead");
  const s = sessionWithWorktree("keep-ahead");
  writeFileSync(join(s.worktree!.basePath, "done.txt"), "x\n");
  git(s.worktree!.basePath, "add", "-A");
  git(s.worktree!.basePath, "commit", "-qm", "work");
  projects.removeInstance("keep-ahead", s.instanceId, "keep");
  assert.ok(!existsSync(s.worktree!.basePath));
  assert.ok(hasBranch(dir, s.worktree!.branch), "unmerged branch survives");
});

test("discard: worktree and branch go, with the work", () => {
  const dir = gitProject("discard");
  const s = sessionWithWorktree("discard");
  writeFileSync(join(s.worktree!.basePath, "work.txt"), "unsaved\n");
  projects.removeInstance("discard", s.instanceId, "discard");
  assert.ok(!rosterIds("discard").includes(s.instanceId));
  assert.ok(!existsSync(s.worktree!.basePath));
  assert.ok(!hasBranch(dir, s.worktree!.branch));
});

test("reset roster checks every session before removing any", () => {
  gitProject("reset");
  const s = sessionWithWorktree("reset");
  writeFileSync(join(s.worktree!.basePath, "work.txt"), "unsaved\n");
  assert.equal(rosterIds("reset").length, 2);
  assert.throws(() => projects.resetRoster("reset"), refusal("session_has_work"));
  assert.equal(rosterIds("reset").length, 2, "the clean session was not removed either");
  projects.resetRoster("reset", "keep");
  assert.deepEqual(rosterIds("reset"), []);
  assert.ok(existsSync(join(s.worktree!.basePath, "work.txt")));
});

test("deleting an agent removes its sessions in every project, other agents' stay", () => {
  gitProject("agent-a");
  gitProject("agent-b");
  projects.addInstance("agent-a", "doomed", undefined, ON);
  projects.addInstance("agent-a", "keeper", undefined, ON);
  const s = sessionWithWorktree("agent-b", "doomed");
  assert.equal(projects.removeAgentSessions("doomed"), 3);
  assert.deepEqual(projects.readProject("agent-a")!.meta.roster.map((i) => i.agentId), ["keeper"]);
  assert.deepEqual(rosterIds("agent-b"), []);
  assert.ok(!existsSync(s.worktree!.basePath));
});

test("deleting an agent with work in a session refuses until told to keep it", () => {
  gitProject("agent-work");
  const s = sessionWithWorktree("agent-work", "busy");
  writeFileSync(join(s.worktree!.basePath, "work.txt"), "unsaved\n");
  assert.throws(() => projects.removeAgentSessions("busy"), refusal("session_has_work"));
  assert.equal(rosterIds("agent-work").length, 2);
  projects.removeAgentSessions("busy", "keep");
  assert.deepEqual(rosterIds("agent-work"), []);
  assert.ok(existsSync(join(s.worktree!.basePath, "work.txt")));
});

test("a worktree whose branch is checked out elsewhere fails the turn instead of using the main checkout", () => {
  const dir = gitProject("unrepairable");
  const s = sessionWithWorktree("unrepairable");
  git(dir, "worktree", "remove", "--force", s.worktree!.basePath);
  git(dir, "checkout", "-q", s.worktree!.branch);
  const project = projects.readProject("unrepairable")!;
  const cwd = projects.resolveInstanceCwd(project, projects.findInstance(project, s.instanceId));
  assert.ok(cwd && cwd !== dir, `must not fall back to the project cwd, got ${cwd}`);
  assert.ok(!existsSync(cwd), "a missing path, so the turn fails as worktree_missing");
  assert.ok(projects.findInstance(projects.readProject("unrepairable"), s.instanceId)!.worktree, "pin kept");
});

test("a mission seat whose branch is gone never gets a fresh branch off HEAD", () => {
  const dir = gitProject("seat");
  const s = sessionWithWorktree("seat");
  const seatBranch = `mission/m1--${s.instanceId}`;
  git(dir, "worktree", "remove", "--force", s.worktree!.basePath);
  git(dir, "branch", "-D", s.worktree!.branch);
  projects.patchInstance("seat",s.instanceId, { worktree: { ...s.worktree!, branch: seatBranch } });
  const project = projects.readProject("seat")!;
  const cwd = projects.resolveInstanceCwd(project, projects.findInstance(project, s.instanceId));
  assert.ok(cwd && !existsSync(cwd));
  assert.equal(git(dir, "branch", "--list", `agent/${s.instanceId}-*`), "", "no fresh session branch");
});

test("a regular session whose branch is gone is recreated on a new branch", () => {
  const dir = gitProject("fresh");
  const s = sessionWithWorktree("fresh");
  git(dir, "worktree", "remove", "--force", s.worktree!.basePath);
  git(dir, "branch", "-D", s.worktree!.branch);
  rmSync(s.worktree!.basePath, { recursive: true, force: true });
  const project = projects.readProject("fresh")!;
  const cwd = projects.resolveInstanceCwd(project, projects.findInstance(project, s.instanceId));
  assert.ok(cwd && existsSync(cwd));
});

test("commits on the session branch count even when its worktree sits on a detached HEAD", () => {
  const dir = gitProject("detached");
  const s = sessionWithWorktree("detached");
  const wtPath = s.worktree!.basePath;
  writeFileSync(join(wtPath, "done.txt"), "x\n");
  git(wtPath, "add", "-A");
  git(wtPath, "commit", "-qm", "work");
  git(wtPath, "checkout", "-q", "--detach", git(dir, "rev-parse", "HEAD"));
  assert.throws(() => projects.removeInstance("detached", s.instanceId), refusal("session_has_work"));
  assert.ok(hasBranch(dir, s.worktree!.branch));
});

test("untracked files count even with status.showUntrackedFiles=no", () => {
  const dir = gitProject("hidden-untracked");
  git(dir, "config", "status.showUntrackedFiles", "no");
  const s = sessionWithWorktree("hidden-untracked");
  writeFileSync(join(s.worktree!.basePath, "new.txt"), "x\n");
  assert.throws(() => projects.removeInstance("hidden-untracked", s.instanceId), refusal("session_has_work"));
});

test("a run owned by another live server counts as running", async () => {
  gitProject("other-server");
  const s = sessionWithWorktree("other-server");
  const { getDb } = await import("../db");
  getDb()
    .prepare("INSERT INTO runs (id, agent_id, agent_name, instance_id, status, prompt, started_at, owner_pid) VALUES (?, ?, ?, ?, 'running', '', ?, ?)")
    .run("other-run", "developer", "developer", s.instanceId, Date.now(), process.ppid);
  try {
    assert.throws(() => projects.removeInstance("other-server", s.instanceId, "discard"), refusal("session_running"));
  } finally {
    getDb().prepare("DELETE FROM runs WHERE id = ?").run("other-run");
  }
});

test("two sessions on the same unmerged commit do not vouch for each other in a reset", () => {
  gitProject("shared-tip");
  const a = sessionWithWorktree("shared-tip");
  const { instance: b } = projects.addInstance("shared-tip", "developer", undefined, ON);
  writeFileSync(join(a.worktree!.basePath, "done.txt"), "x\n");
  git(a.worktree!.basePath, "add", "-A");
  git(a.worktree!.basePath, "commit", "-qm", "work");
  git(b.worktree!.basePath, "merge", "-q", "--ff-only", a.worktree!.branch);
  assert.throws(
    () => projects.resetRoster("shared-tip"),
    (e: unknown) => e instanceof projects.SessionRemovalError && e.code === "session_has_work" && e.sessions.length === 2,
  );
});
