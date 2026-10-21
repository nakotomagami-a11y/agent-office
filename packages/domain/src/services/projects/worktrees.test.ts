/**
 * Boot clean-up of `.worktrees/` (S1-9, S4-3, S7-8): it used to match nothing on
 * Windows (git prints `C:/`, `join` builds `C:\`) and, elsewhere, force-removed
 * and `branch -D`'d every non-session worktree, hand-made ones included.
 *
 *   pnpm --filter @agent-office/domain test src/services/projects/worktrees.test.ts
 */
import assert from "node:assert";
import { test } from "node:test";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const sandbox = mkdtempSync(join(tmpdir(), "ao-wt-reconcile-"));
process.env.HOME = sandbox;
process.env.USERPROFILE = sandbox;

const wt = await import("./worktrees");
const { pathKey } = await import("../infra/paths");

const git = (cwd: string, ...args: string[]): string =>
  execFileSync("git", args, { cwd, stdio: ["ignore", "pipe", "ignore"] }).toString().trim();

let n = 0;
function repo(): string {
  const dir = join(sandbox, `repo-${n++}`);
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

function worktree(dir: string, name: string, branch: string): string {
  const path = join(dir, ".worktrees", name);
  git(dir, "worktree", "add", "-q", path, "-b", branch);
  return path;
}

const hasBranch = (dir: string, branch: string) => git(dir, "branch", "--list", branch) !== "";

test("pathKey matches git's forward-slash spelling of the same directory", () => {
  const dir = repo();
  const fromGit = git(dir, "rev-parse", "--show-toplevel");
  assert.equal(pathKey(fromGit), pathKey(dir));
  if (process.platform === "win32") assert.equal(pathKey(dir.toUpperCase()), pathKey(dir));
});

test("isSessionBranch accepts only the session naming for that instance", () => {
  assert.ok(wt.isSessionBranch("agent/dev-abc-1700000000000", "dev-abc"));
  assert.ok(wt.isSessionBranch("mission/m1--dev-abc", "dev-abc"));
  assert.ok(!wt.isSessionBranch("agent/dev-abcd-1", "dev-abc"));
  assert.ok(!wt.isSessionBranch("feature/dev-abc", "dev-abc"));
  assert.ok(!wt.isSessionBranch("main--dev-abc", "dev-abc"));
});

test("an orphaned clean session worktree is removed with its branch", () => {
  const dir = repo();
  const path = worktree(dir, "dev-gone", "agent/dev-gone-1");
  wt.reconcileWorktrees(dir, new Set());
  assert.ok(!existsSync(path), "orphan worktree should be gone");
  assert.ok(!hasBranch(dir, "agent/dev-gone-1"), "its branch should be gone");
});

test("a hand-made worktree under .worktrees is never touched, even with no roster entry", () => {
  const dir = repo();
  const path = worktree(dir, "mine", "my-feature");
  writeFileSync(join(path, "draft.txt"), "uncommitted\n");
  wt.reconcileWorktrees(dir, new Set());
  assert.ok(existsSync(join(path, "draft.txt")));
  assert.ok(hasBranch(dir, "my-feature"));
});

test("a session-named directory on a foreign branch is not ours either", () => {
  const dir = repo();
  const path = worktree(dir, "dev-x", "experiment");
  wt.reconcileWorktrees(dir, new Set());
  assert.ok(existsSync(path));
  assert.ok(hasBranch(dir, "experiment"));
});

test("an orphaned session worktree with uncommitted changes is kept", () => {
  const dir = repo();
  const path = worktree(dir, "dev-dirty", "agent/dev-dirty-1");
  writeFileSync(join(path, "work.txt"), "unsaved\n");
  wt.reconcileWorktrees(dir, new Set());
  assert.ok(existsSync(join(path, "work.txt")));
});

test("an orphaned session worktree with commits on no other branch is kept", () => {
  const dir = repo();
  const path = worktree(dir, "dev-ahead", "agent/dev-ahead-1");
  writeFileSync(join(path, "done.txt"), "committed\n");
  git(path, "add", "-A");
  git(path, "commit", "-qm", "work");
  wt.reconcileWorktrees(dir, new Set());
  assert.ok(existsSync(path));
  assert.ok(hasBranch(dir, "agent/dev-ahead-1"));
});

test("a worktree whose instance is in the roster is left alone", () => {
  const dir = repo();
  const path = worktree(dir, "dev-live", "agent/dev-live-1");
  wt.reconcileWorktrees(dir, new Set(["dev-live"]));
  assert.ok(existsSync(path));
});

test("inspectWorktree counts uncommitted entries and unmerged commits", () => {
  const dir = repo();
  const path = worktree(dir, "dev-i", "agent/dev-i-1");
  const target = { branch: "agent/dev-i-1", basePath: path };
  assert.deepEqual(wt.inspectWorktree(dir, target), { uncommitted: 0, unmerged: 0 });
  writeFileSync(join(path, "a.txt"), "a\n");
  assert.equal(wt.inspectWorktree(dir, target).uncommitted, 1);
  git(path, "add", "-A");
  git(path, "commit", "-qm", "a");
  assert.deepEqual(wt.inspectWorktree(dir, target), { uncommitted: 0, unmerged: 1 });
  git(dir, "branch", "elsewhere", "agent/dev-i-1");
  assert.equal(wt.inspectWorktree(dir, target).unmerged, 0, "a commit another branch holds is not at risk");
});

test("removeWorktree leaves a folder git does not list as a worktree", () => {
  const dir = repo();
  const path = join(dir, ".worktrees", "dev-plain");
  mkdirSync(path, { recursive: true });
  writeFileSync(join(path, "notes.txt"), "mine\n");
  wt.removeWorktree(dir, { branch: "agent/dev-plain-1", basePath: path }, { force: true, deleteBranch: true });
  assert.ok(existsSync(join(path, "notes.txt")));
});

test("removeWorktree throws instead of logging success when git keeps the directory", () => {
  const dir = repo();
  const path = worktree(dir, "dev-r", "agent/dev-r-1");
  writeFileSync(join(path, "a.txt"), "a\n");
  assert.throws(
    () => wt.removeWorktree(dir, { branch: "agent/dev-r-1", basePath: path }, { force: false, deleteBranch: true }),
    (e: unknown) => e instanceof wt.WorktreeRemoveError,
  );
  assert.ok(existsSync(join(path, "a.txt")));
  assert.ok(hasBranch(dir, "agent/dev-r-1"), "branch is not deleted after a failed remove");
});
