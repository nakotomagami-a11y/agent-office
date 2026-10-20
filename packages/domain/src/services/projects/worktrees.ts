// Git worktree helpers for multi-instance agent support.
// All git commands use execFileSync with an args array — never shell interpolation.

import { execFile, execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, realpathSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { MISSION_GIT_TIMEOUT_MS } from "../../config/missions";
import { log } from "../infra/log";

// Sync git on the request thread: a hung one must not freeze the server. Generous for `worktree remove`.
const GIT_TIMEOUT_MS = 120_000;

const gitOut = (cwd: string, args: string[]): string =>
  execFileSync("git", args, { cwd, stdio: ["ignore", "pipe", "pipe"], windowsHide: true, timeout: GIT_TIMEOUT_MS }).toString();

/** Returns true if the given directory is the root of a git repository (has a .git entry). */
export function isGitRepo(cwd: string): boolean {
  try {
    return existsSync(join(cwd, ".git"));
  } catch {
    return false;
  }
}

/**
 * Returns the absolute path to the worktree directory for a given instance.
 * Pattern: <projectCwd>/.worktrees/<instanceId>
 */
export function worktreePath(projectCwd: string, instanceId: string): string {
  return join(projectCwd, ".worktrees", instanceId);
}

/**
 * Returns the branch name for a worktree.
 * Pattern: agent/<instanceId>-<timestamp>
 * Timestamp suffix prevents branch-already-exists errors on re-creation.
 */
export function worktreeBranch(instanceId: string): string {
  return `agent/${instanceId}-${Date.now()}`;
}

/** Returns true if the worktree directory for an instance exists on disk and is a directory. */
export function worktreeDirExists(projectCwd: string, instanceId: string): boolean {
  const p = worktreePath(projectCwd, instanceId);
  try {
    return existsSync(p) && statSync(p).isDirectory();
  } catch {
    return false;
  }
}

/** Throws when git cannot answer: reading that as "no branch" would start sessions on fresh branches. */
function branchExists(projectCwd: string, branch: string): boolean {
  if (!branch) return false;
  try {
    gitOut(projectCwd, ["show-ref", "--verify", "--quiet", `refs/heads/${branch}`]);
    return true;
  } catch (err) {
    if ((err as { status?: number }).status === 1) return false;
    throw err;
  }
}

/**
 * Recreate an instance's missing worktree on its own branch. A fresh branch off
 * HEAD only when that branch is gone and `freshBranch` allows; one that exists
 * but will not check out is never replaced, since the work is on it. null =
 * cannot be restored, and the caller must not fall back to the shared cwd.
 */
export function ensureWorktree(
  projectCwd: string,
  instanceId: string,
  existingBranch: string | undefined,
  opts: { freshBranch: boolean },
): { branch: string; basePath: string; createdAt: number } | null {
  const basePath = worktreePath(projectCwd, instanceId);

  if (worktreeDirExists(projectCwd, instanceId)) {
    return { branch: existingBranch ?? "", basePath, createdAt: Date.now() };
  }

  // A deleted directory can leave a dangling git registration that blocks re-add.
  try {
    gitOut(projectCwd, ["worktree", "prune"]);
  } catch {
    /* best-effort */
  }

  let branchThere: boolean;
  try {
    branchThere = !!existingBranch && branchExists(projectCwd, existingBranch);
  } catch {
    return null;
  }
  if (branchThere && existingBranch) {
    try {
      gitOut(projectCwd, ["worktree", "add", basePath, existingBranch]);
      log.info("worktree.recreated", { projectCwd, instanceId, branch: existingBranch, basePath });
      return { branch: existingBranch, basePath, createdAt: Date.now() };
    } catch (err) {
      log.warn("worktree.recreate_existing_branch_failed", { instanceId, branch: existingBranch, err: String(err) });
      return null;
    }
  }

  if (!opts.freshBranch) {
    log.warn("worktree.recreate_refused", { projectCwd, instanceId, branch: existingBranch ?? null });
    return null;
  }

  const branch = worktreeBranch(instanceId);
  try {
    gitOut(projectCwd, ["worktree", "add", basePath, "-b", branch]);
    log.info("worktree.recreated_new_branch", { projectCwd, instanceId, branch, basePath });
    return { branch, basePath, createdAt: Date.now() };
  } catch (err) {
    log.warn("worktree.recreate_failed", {
      instanceId,
      err: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

/**
 * Create a git worktree for an agent instance.
 * - Creates .worktrees/ directory if it doesn't exist.
 * - Runs: git worktree add <path> -b <branch>
 * - Warns (but does not block) if .gitmodules is present.
 * - Returns { branch, basePath, createdAt } on success.
 * - Throws with a descriptive error if git fails.
 */
export function createWorktree(
  projectCwd: string,
  agentId: string,
  instanceId: string,
): { branch: string; basePath: string; createdAt: number } {
  const worktreesDir = join(projectCwd, ".worktrees");
  mkdirSync(worktreesDir, { recursive: true });

  if (existsSync(join(projectCwd, ".gitmodules"))) {
    log.warn("worktree.gitmodules_present", {
      projectCwd,
      note: "project uses git submodules — worktree may not have submodules checked out",
    });
  }

  const basePath = worktreePath(projectCwd, instanceId);
  const branch = worktreeBranch(instanceId);
  const createdAt = Date.now();

  try {
    execFileSync("git", ["worktree", "add", basePath, "-b", branch], {
      cwd: projectCwd,
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    throw new Error(
      `git worktree add failed for instance '${instanceId}' (agent '${agentId}') in '${projectCwd}': ${detail}`,
    );
  }

  log.info("worktree.created", { projectCwd, agentId, instanceId, branch, basePath });
  return { branch, basePath, createdAt };
}

const execFileAsync = promisify(execFile);

/** A worktree on a mission's hub branch: a seat-local branch tracking `origin/<hubBranch>`, since
 *  two seats on one device cannot both check out the hub branch itself. `env` carries the
 *  project's GitHub credentials for the fetch. Async with a timeout and no prompts: it runs inside
 *  a request, and a credential dialog must not freeze the server. */
export async function createMissionWorktree(
  projectCwd: string,
  instanceId: string,
  hubBranch: string,
  env: NodeJS.ProcessEnv,
): Promise<{ branch: string; basePath: string; createdAt: number }> {
  const basePath = worktreePath(projectCwd, instanceId);
  const branch = `${hubBranch}--${instanceId}`;
  mkdirSync(join(projectCwd, ".worktrees"), { recursive: true });
  const quiet = { ...env, GIT_TERMINAL_PROMPT: "0", GCM_INTERACTIVE: "never" };
  const git = (args: string[]) => execFileAsync("git", args, { cwd: projectCwd, env: quiet, timeout: MISSION_GIT_TIMEOUT_MS, windowsHide: true });
  try {
    await git(["fetch", "origin", `+refs/heads/${hubBranch}:refs/remotes/origin/${hubBranch}`]);
    await git(["worktree", "add", "--track", "-b", branch, basePath, `origin/${hubBranch}`]);
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    throw new Error(`mission worktree for '${instanceId}' on '${hubBranch}' failed in '${projectCwd}': ${detail}`);
  }
  log.info("worktree.mission_created", { projectCwd, instanceId, branch, hubBranch });
  return { branch, basePath, createdAt: Date.now() };
}

/** Raised when git keeps a worktree it was asked to remove (on Windows: an open file or a process inside it). */
export class WorktreeRemoveError extends Error {
  readonly code = "worktree_remove_failed";
  constructor(readonly basePath: string, readonly detail: string) {
    super(`git worktree remove failed for '${basePath}': ${detail}`);
    this.name = "WorktreeRemoveError";
  }
}

/**
 * One spelling per directory. git prints `C:/x/y` where `join` builds `C:\x\y`,
 * Windows paths ignore case, and macOS tmp dirs sit behind `/var` → `/private/var`;
 * comparing raw strings matched nothing on Windows.
 */
export function pathKey(p: string): string {
  let abs = resolve(p);
  try {
    abs = realpathSync.native(abs);
  } catch {
    /* missing: the resolved form is the best key */
  }
  return process.platform === "win32" ? abs.toLowerCase() : abs;
}

/** Branch names Agent Office gives a session: `agent/<id>-<ts>`, or a mission seat's `mission/<m>--<id>`. */
export function isSessionBranch(branch: string, instanceId: string): boolean {
  return (
    branch.startsWith(`agent/${instanceId}-`) ||
    (branch.startsWith("mission/") && branch.endsWith(`--${instanceId}`))
  );
}

/** What removing a worktree would destroy. */
export interface WorktreeWork {
  /** Modified, staged or untracked files in the worktree; ignored files are not counted. */
  uncommitted: number;
  /** Commits no surviving branch, remote-tracking branch or tag holds. */
  unmerged: number;
  /** git could not answer, so nothing is known to be safe. */
  unknown?: true;
}

export function hasWork(w: WorktreeWork): boolean {
  return w.uncommitted > 0 || w.unmerged > 0 || w.unknown === true;
}

const globEscape = (s: string) => s.replace(/[*?[\\]/g, "\\$&");

/** `going` branches cannot vouch for each other; `--all` would count the worktree's own HEAD and answer 0. */
function unmergedCount(cwd: string, refs: string[], going: string[]): number {
  const exclude = going.filter(Boolean).map((b) => `--exclude=${globEscape(b)}`);
  const out = gitOut(cwd, ["rev-list", "--count", ...refs, "--not", ...exclude, "--branches", "--remotes", "--tags"]);
  return Number.parseInt(out.trim(), 10) || 0;
}

/** HEAD and the session branch both: a detached worktree still has the branch's commits to lose.
 *  `alsoGoing`: the other branches deleted in the same batch. */
export function inspectWorktree(
  projectCwd: string,
  wt: { branch: string; basePath: string },
  alsoGoing: string[] = [],
): WorktreeWork {
  try {
    const own = wt.branch && branchExists(projectCwd, wt.branch) ? [`refs/heads/${wt.branch}`] : [];
    const going = [wt.branch, ...alsoGoing];
    if (!existsSync(wt.basePath)) {
      return { uncommitted: 0, unmerged: own.length ? unmergedCount(projectCwd, own, going) : 0 };
    }
    // A directory that lost its `.git` file would answer for the main checkout instead.
    if (pathKey(gitOut(wt.basePath, ["rev-parse", "--show-toplevel"]).trim()) !== pathKey(wt.basePath)) {
      return { uncommitted: 0, unmerged: 0, unknown: true };
    }
    // Explicit flags: `status.showUntrackedFiles=no` in the user's config would hide new files.
    const status = gitOut(wt.basePath, ["status", "--porcelain", "--untracked-files=all", "--ignore-submodules=none"]);
    const uncommitted = status.split(/\r?\n/).filter((l) => l.trim()).length;
    return { uncommitted, unmerged: unmergedCount(wt.basePath, ["HEAD", ...own], going) };
  } catch (err) {
    log.warn("worktree.inspect_failed", { basePath: wt.basePath, err: err instanceof Error ? err.message : String(err) });
    return { uncommitted: 0, unmerged: 0, unknown: true };
  }
}

/**
 * Remove a worktree, then its branch if `deleteBranch`. Throws WorktreeRemoveError when git keeps
 * it or cannot list worktrees. A folder git does not list may be anyone's, so it stays; a branch
 * that will not delete is only logged.
 */
export function removeWorktree(
  projectCwd: string,
  worktree: { branch: string; basePath: string },
  opts: { force: boolean; deleteBranch: boolean },
): void {
  const fail = (detail: string): never => {
    log.warn("worktree.remove_failed", { basePath: worktree.basePath, err: detail });
    throw new WorktreeRemoveError(worktree.basePath, detail.slice(0, 300));
  };
  const folderExists = existsSync(worktree.basePath);
  const registered = getRegisteredWorktrees(projectCwd);
  if (folderExists && !registered && isGitRepo(projectCwd)) fail("git worktree list failed");
  let folderRemoved = false;
  if (folderExists && registered?.has(pathKey(worktree.basePath))) {
    try {
      gitOut(projectCwd, ["worktree", "remove", ...(opts.force ? ["--force"] : []), worktree.basePath]);
      folderRemoved = true;
    } catch (err) {
      fail(err instanceof Error ? err.message : String(err));
    }
  } else {
    if (folderExists) log.warn("worktree.remove_not_registered", { basePath: worktree.basePath });
    try {
      gitOut(projectCwd, ["worktree", "prune"]);
    } catch {
      /* best-effort: a stale registration only blocks the branch delete below */
    }
  }

  let branchDeleted = false;
  if (opts.deleteBranch && worktree.branch) {
    try {
      if (branchExists(projectCwd, worktree.branch)) {
        gitOut(projectCwd, ["branch", "-D", worktree.branch]);
        branchDeleted = true;
      }
    } catch (err) {
      log.warn("worktree.branch_delete_failed", {
        branch: worktree.branch,
        err: err instanceof Error ? err.message : String(err),
      });
    }
  }

  log.info("worktree.released", { projectCwd, branch: worktree.branch, basePath: worktree.basePath, folderRemoved, branchDeleted });
}

/** pathKey → branch ("" if detached) for every worktree git knows, main included. null when git
 *  cannot answer: an empty map would read as "nothing here is a worktree". */
function getRegisteredWorktrees(projectCwd: string): Map<string, string> | null {
  const result = new Map<string, string>();
  try {
    const output = gitOut(projectCwd, ["worktree", "list", "--porcelain"]);
    let currentKey = "";
    for (const line of output.split(/\r?\n/)) {
      if (line.startsWith("worktree ")) {
        currentKey = pathKey(line.slice("worktree ".length).trim());
        result.set(currentKey, "");
      } else if (line.startsWith("branch ") && currentKey) {
        const ref = line.slice("branch ".length).trim();
        result.set(currentKey, ref.startsWith("refs/heads/") ? ref.slice("refs/heads/".length) : ref);
      }
    }
  } catch (err) {
    log.warn("worktree.list_failed", {
      projectCwd,
      err: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
  return result;
}

/**
 * Boot clean-up of `<projectCwd>/.worktrees/` entries with no roster instance.
 *
 * Only an Agent Office session worktree is ever touched: registered with git,
 * named by an instance id, on that id's session branch. Anything else under
 * `.worktrees/` is someone's own and is left alone. A session worktree holding
 * uncommitted changes or unmerged commits is kept too (logged), never forced.
 */
export function reconcileWorktrees(
  projectCwd: string,
  rosterInstanceIds: Set<string>,
): void {
  const worktreesDir = join(projectCwd, ".worktrees");
  if (!existsSync(worktreesDir)) return;

  let dirs: string[];
  try {
    dirs = readdirSync(worktreesDir);
  } catch {
    return;
  }

  const registeredWorktrees = getRegisteredWorktrees(projectCwd);
  if (!registeredWorktrees) return;
  let removed = 0;

  for (const dirName of dirs) {
    const dirPath = join(worktreesDir, dirName);
    try {
      if (!statSync(dirPath).isDirectory()) continue;
    } catch {
      continue;
    }
    if (rosterInstanceIds.has(dirName)) continue;

    const branch = registeredWorktrees.get(pathKey(dirPath));
    if (branch === undefined || !isSessionBranch(branch, dirName)) {
      log.info("worktree.reconcile_skipped_foreign", { dirPath, branch: branch ?? null });
      continue;
    }

    const work = inspectWorktree(projectCwd, { branch, basePath: dirPath });
    if (hasWork(work)) {
      log.warn("worktree.orphan_kept", { dirPath, branch, ...work });
      continue;
    }

    try {
      removeWorktree(projectCwd, { branch, basePath: dirPath }, { force: false, deleteBranch: true });
      removed++;
    } catch {
      /* logged by removeWorktree; the next boot tries again */
    }
  }

  if (removed > 0) {
    log.info("worktree.reconcile_done", { projectCwd, orphansRemoved: removed });
  }
}
