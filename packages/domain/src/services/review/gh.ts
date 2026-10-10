// Runs the GitHub CLI for one project: its cwd (gh resolves the repo from the git
// remote) and the GitHub identity the project's agents push with. Never a shell.
import { spawn } from "node:child_process";
import { DEFAULT_GITHUB_ACCOUNT_ID, buildAugmentedPath } from "../infra/paths";
import { deleteEnvKeys, GH_TOKEN_VARS } from "../infra/env-keys";
import type { ReviewErrorCode } from "../../config/review";
import type { Project } from "../../types/index";
import * as githubAccounts from "../accounts/github-accounts";
import * as secrets from "../accounts/secrets";

export interface GhCall {
  args: string[];
  cwd: string;
  env: NodeJS.ProcessEnv;
  input?: string;
}

/** stdout on exit 0; otherwise throws ReviewError. Swappable so tests never need gh. */
export type GhRunner = (call: GhCall) => Promise<string>;

export class ReviewError extends Error {
  constructor(readonly code: ReviewErrorCode, readonly detail: string) {
    super(`${code}: ${detail}`);
  }
}

const TIMEOUT_MS = 60_000;
const MAX_STDOUT = 64 * 1024 * 1024;

/** `gh api` prints only "Unprocessable Entity (HTTP 422)" on stderr; GitHub's reasons
 *  (`errors[]`) arrive in the response body, which gh writes to stdout. */
export function failureDetail(stderr: string, stdout: string): string {
  let reasons = "";
  try {
    const body: unknown = JSON.parse(stdout);
    const errors = typeof body === "object" && body !== null ? (body as { errors?: unknown }).errors : undefined;
    if (Array.isArray(errors)) {
      reasons = errors
        .map((e: unknown) => {
          if (typeof e === "string") return e;
          if (typeof e !== "object" || e === null) return "";
          // GitHub validation errors are often { resource, field, code } with no message.
          const { message, field, code } = e as { message?: unknown; field?: unknown; code?: unknown };
          return typeof message === "string" ? message : [field, code].filter((x) => typeof x === "string").join(" ");
        })
        .filter(Boolean)
        .join("; ");
    }
  } catch {
    /* not a JSON error body */
  }
  return [stderr.trim(), reasons].filter(Boolean).join(" | ").slice(0, 1000);
}

export function classifyGhFailure(detail: string): ReviewErrorCode {
  const s = detail.toLowerCase();
  if (s.includes("gh auth login") || s.includes("not logged in") || s.includes("bad credentials") || s.includes("http 401")) return "gh_unauthenticated";
  if (s.includes("not a git repository") || s.includes("none of the git remotes") || s.includes("no git remotes")) return "not_github_repo";
  if (s.includes("could not resolve to a pullrequest") || s.includes("no pull requests found")) return "pr_not_found";
  return "gh_failed";
}

export const runGh: GhRunner = ({ args, cwd, env, input }) =>
  new Promise((resolve, reject) => {
    let child;
    try {
      child = spawn("gh", args, { cwd, env, windowsHide: true });
    } catch (err) {
      // Thrown synchronously: an argument with a NUL byte, a command line over the OS limit.
      reject(new ReviewError("gh_failed", err instanceof Error ? err.message : String(err)));
      return;
    }
    let stdout = "";
    let stderr = "";
    let failed: ReviewError | null = null;
    const stop = (e: ReviewError) => { failed ??= e; child.kill(); };
    const timer = setTimeout(() => stop(new ReviewError("gh_failed", `timed out after ${TIMEOUT_MS / 1000}s`)), TIMEOUT_MS);
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (d: string) => {
      if (failed) return;
      stdout += d; // UTF-16 units, close enough to bytes for a runaway-output cap
      if (stdout.length > MAX_STDOUT) stop(new ReviewError("gh_failed", "output too large"));
    });
    child.stderr.on("data", (d: string) => { if (stderr.length < 64 * 1024) stderr += d; });
    child.on("error", (err: NodeJS.ErrnoException) => {
      clearTimeout(timer);
      reject(err.code === "ENOENT" ? new ReviewError("gh_missing", "gh is not on PATH") : new ReviewError("gh_failed", err.message));
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (failed) return reject(failed);
      if (code === 0) return resolve(stdout);
      const detail = failureDetail(stderr, stdout) || `exit ${code}`;
      reject(new ReviewError(classifyGhFailure(detail), detail));
    });
    // gh can exit before reading stdin; an unhandled EPIPE on a large payload would kill the server.
    child.stdin.on("error", () => {});
    child.stdin.end(input ?? "");
  });

/** The identity the project's agents push with (runs/spawn-env.ts): its GitHub account's
 *  GH_CONFIG_DIR, else the inherited one, plus a gh token held as a project secret
 *  (which outranks the account, exactly as in runs/spawn-env.ts).
 *  The repo always comes from the cwd, never from GH_REPO / GH_HOST. */
export function ghEnv(project: Project): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    PATH: buildAugmentedPath(),
    GH_PROMPT_DISABLED: "1",
    GH_PAGER: "cat",
    NO_COLOR: "1",
    CLICOLOR: "0",
  };
  deleteEnvKeys(env, ["GH_REPO", "GH_HOST", "GH_DEBUG"]);
  const accountId = project.meta.githubAccountId;
  if (accountId && accountId !== DEFAULT_GITHUB_ACCOUNT_ID) {
    const account = githubAccounts.get(accountId);
    if (!account) throw new ReviewError("github_account_missing", accountId);
    env.GH_CONFIG_DIR = account.configDir;
    deleteEnvKeys(env, GH_TOKEN_VARS);
  }
  for (const s of secrets.listRawForProject(project.id)) {
    if ((GH_TOKEN_VARS as readonly string[]).includes(s.name)) env[s.name] = s.value;
  }
  return env;
}
