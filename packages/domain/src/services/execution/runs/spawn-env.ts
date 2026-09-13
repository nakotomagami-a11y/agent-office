// Spawn environment resolution — turns a run's options into the concrete
// `env` the `claude` child process inherits: which Claude account config dir,
// which GitHub identity (with git credential-helper plumbing), and the
// project's linked secrets. Pure: no dependency on the live-run registry or
// stream handling, so it's independently testable (env plumbing is the whole
// multi-account spawn contract).

import type { StartRunOpts } from "./types";
import { log } from "../../infra/log";
import { buildAugmentedPath, DEFAULT_ACCOUNT_ID, DEFAULT_GITHUB_ACCOUNT_ID } from "../../infra/paths";
import { readProject } from "../../projects/projects";
import * as accounts from "../../accounts/accounts";
import * as githubAccounts from "../../accounts/github-accounts";
import * as secrets from "../../accounts/secrets";

/**
 * Force a spawned git process to authenticate github.com as the account whose
 * dir is in `env.GH_CONFIG_DIR`, using git's `GIT_CONFIG_*` env mechanism so
 * nothing on disk (the user's global ~/.gitconfig) is mutated. We append two
 * entries after any pre-existing GIT_CONFIG_COUNT: an empty value to reset the
 * github.com helper list (clobbering any OS-cached / global helper that would
 * otherwise win), then `!gh auth git-credential`, which reads GH_CONFIG_DIR at
 * runtime. `gh` is resolved via the augmented PATH already set on `env`.
 */
function applyGitCredentialHelper(env: NodeJS.ProcessEnv): void {
  const base = Number.parseInt(env.GIT_CONFIG_COUNT ?? "", 10);
  const start = Number.isNaN(base) || base < 0 ? 0 : base;
  env[`GIT_CONFIG_KEY_${start}`] = "credential.https://github.com.helper";
  env[`GIT_CONFIG_VALUE_${start}`] = "";
  env[`GIT_CONFIG_KEY_${start + 1}`] = "credential.https://github.com.helper";
  env[`GIT_CONFIG_VALUE_${start + 1}`] = "!gh auth git-credential";
  env.GIT_CONFIG_COUNT = String(start + 2);
}

/**
 * Resolve the effective account for a run and return the spawn env. Explicit
 * `opts.accountId` beats the project's accountId. `default` (or missing) →
 * no CLAUDE_CONFIG_DIR is set, and the child inherits the shared ~/.claude.
 *
 * Exported for unit testing (env plumbing is the entire multi-account
 * spawn contract). `startRun` is the sole production caller.
 */
export function resolveSpawnEnv(opts: StartRunOpts): { env: NodeJS.ProcessEnv; accountId: string | undefined } {
  const explicit = opts.accountId;
  // Read the project once — both accountId and githubAccountId come off it.
  const project = opts.projectId ? readProject(opts.projectId) : undefined;
  const fromProject = !explicit ? project?.meta.accountId : undefined;
  const resolvedId = explicit ?? fromProject;
  const env: NodeJS.ProcessEnv = { ...process.env, PATH: buildAugmentedPath() };
  if (resolvedId && resolvedId !== DEFAULT_ACCOUNT_ID) {
    const account = accounts.get(resolvedId);
    if (account) {
      env.CLAUDE_CONFIG_DIR = account.configDir;
    } else {
      log.warn("run.account_missing", { runId: opts.projectId, accountId: resolvedId });
    }
  }

  // Per-project GitHub account: inject GH_CONFIG_DIR so every git/gh command the
  // agent runs uses that identity. Only ever sourced from the project (no
  // explicit opts override). `default`/unset → no injection → inherit system gh.
  const githubAccountId = project?.meta.githubAccountId;
  if (githubAccountId && githubAccountId !== DEFAULT_GITHUB_ACCOUNT_ID) {
    const githubAccount = githubAccounts.get(githubAccountId);
    if (githubAccount) {
      env.GH_CONFIG_DIR = githubAccount.configDir;
      // GH_CONFIG_DIR only redirects the `gh` CLI. `git push/fetch` over HTTPS
      // authenticate via git's credential system, which ignores GH_CONFIG_DIR —
      // so without this, git falls back to whatever the machine's global git
      // config / OS credential store cached (the WRONG account) and fails with
      // "Repository not found". We inject the credential helper directly into
      // the child's env with GIT_CONFIG_* (never touching the user's global
      // ~/.gitconfig): reset the github.com helper list, then set
      // `gh auth git-credential`, which resolves its token from GH_CONFIG_DIR at
      // runtime. Scoped to this spawn and gated on a non-default account, so the
      // default/system-gh path is untouched.
      applyGitCredentialHelper(env);
    } else {
      log.warn("run.github_account_missing", { projectId: opts.projectId, githubAccountId });
    }
  }

  // Per-project secrets: inject each linked secret as its named env var. Free-
  // form — `env[name] = value` verbatim (see secrets.ts). Only sourced from the
  // project; a run with no projectId gets none.
  if (opts.projectId) {
    for (const secret of secrets.listRawForProject(opts.projectId)) {
      env[secret.name] = secret.value;
    }
  }

  return { env, accountId: resolvedId };
}
