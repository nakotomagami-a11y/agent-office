// Git worktree helpers for multi-instance agent support.
// All git commands use execFileSync with an args array — never shell interpolation.

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { log } from "./log";

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

/** Returns true if a local branch with the given name exists in the repo. */
function branchExists(projectCwd: string, branch: string): boolean {
  if (!branch) return false;
  try {
    execFileSync("git", ["show-ref", "--verify", "--quiet", `refs/heads/${branch}`], {
      cwd: projectCwd,
      stdio: ["ignore", "ignore", "ignore"],
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Ensure a worktree directory exists for an instance, recreating it if missing.
 * Idempotent — safe to call before every run.
 * - If the directory already exists, returns its descriptor unchanged.
 * - Otherwise prunes stale git registrations, then recreates the worktree,
 *   reusing the original branch when it still exists and falling back to a
 *   fresh branch when it doesn't.
 * - Returns the worktree descriptor, or null if recreation failed (the caller
 *   should then fall back to the shared project cwd).
 */
export function ensureWorktree(
  projectCwd: string,
  instanceId: string,
  existingBranch?: string,
): { branch: string; basePath: string; createdAt: number } | null {
  const basePath = worktreePath(projectCwd, instanceId);

  if (worktreeDirExists(projectCwd, instanceId)) {
    return { branch: existingBranch ?? "", basePath, createdAt: Date.now() };
  }

  // A deleted directory can leave a dangling git registration that blocks re-add.
  try {
    execFileSync("git", ["worktree", "prune"], {
      cwd: projectCwd,
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch {
    /* best-effort */
  }

  // Prefer reusing the instance's original branch so prior work is recovered.
  if (existingBranch && branchExists(projectCwd, existingBranch)) {
    try {
      execFileSync("git", ["worktree", "add", basePath, existingBranch], {
        cwd: projectCwd,
        stdio: ["ignore", "pipe", "pipe"],
      });
      log.info("worktree.recreated", { projectCwd, instanceId, branch: existingBranch, basePath });
      return { branch: existingBranch, basePath, createdAt: Date.now() };
    } catch (err) {
      log.warn("worktree.recreate_existing_branch_failed", {
        instanceId,
        branch: existingBranch,
        err: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // Fall back to a brand-new branch off HEAD.
  const branch = worktreeBranch(instanceId);
  try {
    execFileSync("git", ["worktree", "add", basePath, "-b", branch], {
      cwd: projectCwd,
      stdio: ["ignore", "pipe", "pipe"],
    });
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

/**
 * Remove a git worktree and delete its branch.
 * If the path doesn't exist, logs a warning and returns without error.
 * If git fails, logs a warning and returns without rethrowing.
 */
export function removeWorktree(
  projectCwd: string,
  worktree: { branch: string; basePath: string },
): void {
  if (!existsSync(worktree.basePath)) {
    log.warn("worktree.remove_path_missing", {
      basePath: worktree.basePath,
      branch: worktree.branch,
    });
    return;
  }

  let worktreeRemoved = false;
  try {
    execFileSync("git", ["worktree", "remove", "--force", worktree.basePath], {
      cwd: projectCwd,
      stdio: ["ignore", "pipe", "pipe"],
    });
    worktreeRemoved = true;
  } catch (err) {
    log.warn("worktree.remove_failed", {
      basePath: worktree.basePath,
      err: err instanceof Error ? err.message : String(err),
    });
  }

  if (worktreeRemoved) {
    try {
      execFileSync("git", ["branch", "-D", worktree.branch], {
        cwd: projectCwd,
        stdio: ["ignore", "pipe", "pipe"],
      });
    } catch (err) {
      log.warn("worktree.branch_delete_failed", {
        branch: worktree.branch,
        err: err instanceof Error ? err.message : String(err),
      });
    }
  }

  log.info("worktree.removed", { projectCwd, branch: worktree.branch, basePath: worktree.basePath });
}

/**
 * List all worktree directories that physically exist inside <projectCwd>/.worktrees/.
 * Returns absolute paths.
 */
export function listWorktrees(projectCwd: string): string[] {
  const worktreesDir = join(projectCwd, ".worktrees");
  if (!existsSync(worktreesDir)) return [];
  try {
    return readdirSync(worktreesDir)
      .map((name) => join(worktreesDir, name))
      .filter((p) => {
        try {
          return statSync(p).isDirectory();
        } catch {
          return false;
        }
      });
  } catch {
    return [];
  }
}

/**
 * Returns a map of absolute worktree path → branch name for all worktrees
 * registered with git. Parses `git worktree list --porcelain` output.
 * The main worktree is included; callers filter it out as needed.
 * Branch value is an empty string for detached HEAD worktrees.
 */
function getRegisteredWorktrees(projectCwd: string): Map<string, string> {
  const result = new Map<string, string>();
  try {
    const output = execFileSync("git", ["worktree", "list", "--porcelain"], {
      cwd: projectCwd,
      stdio: ["ignore", "pipe", "pipe"],
    }).toString();
    let currentPath = "";
    for (const line of output.split("\n")) {
      if (line.startsWith("worktree ")) {
        currentPath = line.slice("worktree ".length).trim();
        result.set(currentPath, "");
      } else if (line.startsWith("branch ") && currentPath) {
        // branch refs/heads/<name>
        const ref = line.slice("branch ".length).trim();
        const branch = ref.startsWith("refs/heads/") ? ref.slice("refs/heads/".length) : ref;
        result.set(currentPath, branch);
      }
    }
  } catch (err) {
    log.warn("worktree.list_failed", {
      projectCwd,
      err: err instanceof Error ? err.message : String(err),
    });
  }
  return result;
}

/**
 * Reconcile worktrees for a single project.
 * Removes any directories in <projectCwd>/.worktrees/ whose name does not
 * match an active instanceId in the roster.
 *
 * Directory name format: <instanceId>  (the directory base-name equals the instanceId)
 *
 * rosterInstanceIds: Set of instanceIds currently in the project's roster.
 */
export function reconcileWorktrees(
  projectCwd: string,
  rosterInstanceIds: Set<string>,
): void {
  const worktreesDir = join(projectCwd, ".worktrees");
  if (!existsSync(worktreesDir)) return;

  let removed = 0;
  let dirs: string[];
  try {
    dirs = readdirSync(worktreesDir);
  } catch {
    return;
  }

  // Fetch registered git worktrees once for the whole reconcile pass.
  const registeredWorktrees = getRegisteredWorktrees(projectCwd);

  for (const dirName of dirs) {
    const dirPath = join(worktreesDir, dirName);
    try {
      if (!statSync(dirPath).isDirectory()) continue;
    } catch {
      continue;
    }

    // Directory name is the instanceId directly.
    if (rosterInstanceIds.has(dirName)) continue;

    log.warn("worktree.orphan_found", { dirPath, projectCwd });

    if (!registeredWorktrees.has(dirPath)) {
      // Not a registered git worktree — skip git command to avoid errors on
      // user-created directories.
      log.warn("worktree.orphan_not_registered", {
        dirPath,
        note: "directory not in git worktree list — skipping removal",
      });
      continue;
    }

    const orphanBranch = registeredWorktrees.get(dirPath) ?? "";

    // Attempt git worktree remove for cleanliness, then fall back to warn.
    let worktreeRemoved = false;
    try {
      execFileSync("git", ["worktree", "remove", "--force", dirPath], {
        cwd: projectCwd,
        stdio: ["ignore", "pipe", "pipe"],
      });
      worktreeRemoved = true;
      removed++;
      log.info("worktree.orphan_removed", { dirPath });
    } catch (err) {
      log.warn("worktree.orphan_remove_failed", {
        dirPath,
        err: err instanceof Error ? err.message : String(err),
      });
    }

    if (worktreeRemoved && orphanBranch) {
      try {
        execFileSync("git", ["branch", "-D", orphanBranch], {
          cwd: projectCwd,
          stdio: ["ignore", "pipe", "pipe"],
        });
        log.info("worktree.orphan_branch_deleted", { orphanBranch });
      } catch (err) {
        log.warn("worktree.orphan_branch_delete_failed", {
          orphanBranch,
          err: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  if (removed > 0) {
    log.info("worktree.reconcile_done", { projectCwd, orphansRemoved: removed });
  }
}
