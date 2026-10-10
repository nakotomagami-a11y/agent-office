/**
 * The worktree decision table for addInstance.
 *
 * `attachWorktree` was extracted out of `addInstance` to clear a
 * max-lines-per-function warning, turning
 *   `if (n >= 1 && multiInstance && cwd && isGitRepo(cwd)) {...}
 *    else if (n >= 1 && !isGitRepo(cwd ?? "")) {...}`
 * into early returns. That is a refactor of untested code on the path that
 * decides WHERE AN AGENT RUNS — getting it wrong silently sends an agent to
 * the wrong directory. This pins the table so the next edit cannot drift.
 *
 *   pnpm --filter @agent-office/domain test
 */
import assert from "node:assert";
import { test } from "node:test";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AppSettings } from "../../types/index";

const sandbox = mkdtempSync(join(tmpdir(), "ao-worktree-"));
process.env.HOME = sandbox;
process.env.USERPROFILE = sandbox; // os.homedir() reads this on Windows, not HOME

const claudeDir = join(sandbox, ".claude");
const projectsRoot = join(sandbox, "root");
mkdirSync(join(claudeDir, "projects"), { recursive: true });
mkdirSync(projectsRoot, { recursive: true });
writeFileSync(
  join(claudeDir, "agent-office-settings.json"),
  JSON.stringify({ projectsRoot, excluded: [], firstRunComplete: true }),
);

const projects = await import("./projects");

const git = (cwd: string, ...args: string[]): void => {
  execFileSync("git", args, { cwd, stdio: "ignore" });
};

/** A project folder that is a real git repo with one commit (worktrees need a HEAD). */
function gitProject(id: string): string {
  const dir = join(projectsRoot, id);
  mkdirSync(dir, { recursive: true });
  git(dir, "init", "-q");
  git(dir, "config", "user.email", "t@t.t");
  git(dir, "config", "user.name", "t");
  writeFileSync(join(dir, "README.md"), "x\n");
  git(dir, "add", "-A");
  git(dir, "commit", "-qm", "init");
  return dir;
}

function plainProject(id: string): string {
  const dir = join(projectsRoot, id);
  mkdirSync(dir, { recursive: true });
  return dir;
}

const ON = { features: { multiInstance: true } } as unknown as AppSettings;
const OFF = { features: { multiInstance: false } } as unknown as AppSettings;

/** Add two instances of the same agent; the SECOND is the one that may get a worktree. */
function addTwo(id: string, settings: AppSettings) {
  projects.addInstance(id, "developer", undefined, settings);
  return projects.addInstance(id, "developer", undefined, settings).instance;
}

test("first instance never gets a worktree, even with the flag on in a git repo", () => {
  gitProject("first");
  const { instance } = projects.addInstance("first", "developer", undefined, ON);
  assert.equal(instance.worktree, undefined);
  assert.equal(instance.cwd, undefined, "shares the project cwd");
});

test("second instance in a git repo with the flag ON gets its own worktree", () => {
  gitProject("on-git");
  const second = addTwo("on-git", ON);
  assert.ok(second.worktree, "expected a worktree");
  assert.ok(second.cwd?.includes(".worktrees"), `expected a worktree cwd, got ${second.cwd}`);
});

test("second instance in a git repo with the flag OFF shares the project cwd", () => {
  gitProject("off-git");
  const second = addTwo("off-git", OFF);
  assert.equal(second.worktree, undefined);
  assert.equal(second.cwd, undefined);
});

test("second instance in a NON-git folder shares the project cwd, flag irrelevant", () => {
  plainProject("on-plain");
  const second = addTwo("on-plain", ON);
  assert.equal(second.worktree, undefined);
  assert.equal(second.cwd, undefined);
});

test("null settings behaves as the flag being off", () => {
  gitProject("null-settings");
  projects.addInstance("null-settings", "developer", undefined, null);
  const second = projects.addInstance("null-settings", "developer", undefined, null).instance;
  assert.equal(second.worktree, undefined);
});

test("the roster still records every instance regardless of worktree outcome", () => {
  gitProject("roster-check");
  addTwo("roster-check", ON);
  assert.equal(projects.readProject("roster-check")!.meta.roster.length, 2);
});
