/**
 * Self-check for the per-project GitHub-account spawn-env contract. Run against
 * a throwaway HOME so it never touches the real ~/.claude (tsx, not bun — bun
 * can't load better-sqlite3's native binding):
 *   HOME=$(mktemp -d) npx tsx packages/domain/src/services/runs.spawn-env.test.ts
 *
 * Asserts resolveSpawnEnv injects GH_CONFIG_DIR AND the git credential-helper
 * env (GIT_CONFIG_*) when a project pins a non-default githubAccountId, and
 * omits both for the default / unset case (backward-compatible: no injection →
 * inherit system gh auth). The git env is what makes `git push` — not just the
 * `gh` CLI — authenticate as the project's account.
 */
import assert from "node:assert";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

import { resolveSpawnEnv } from "./runs";
import * as githubAccounts from "./github-accounts";
import { SETTINGS_FILE, PROJECTS_DIR } from "./paths";

const HOME = homedir();
assert(HOME.startsWith("/tmp") || HOME.includes("tmp"), "refusing to run outside a throwaway HOME");

const PROJECTS_ROOT = join(HOME, "projects-root");

function baseOpts(projectId?: string) {
  return {
    agentId: "developer",
    agentName: "Developer",
    prompt: "p",
    model: "opus",
    effort: "high",
    args: [] as string[],
    ...(projectId ? { projectId } : {}),
  };
}

function seedProject(id: string, githubAccountId?: string): void {
  mkdirSync(join(PROJECTS_ROOT, id), { recursive: true });
  mkdirSync(join(PROJECTS_DIR, id), { recursive: true });
  const fm = githubAccountId
    ? `---\nname: ${id}\ngithubAccountId: ${githubAccountId}\n---\n`
    : `---\nname: ${id}\n---\n`;
  writeFileSync(join(PROJECTS_DIR, id, "project.md"), fm);
}

// Settings so readProject can scan.
mkdirSync(join(HOME, ".claude"), { recursive: true });
mkdirSync(PROJECTS_ROOT, { recursive: true });
writeFileSync(
  SETTINGS_FILE,
  JSON.stringify({ projectsRoot: PROJECTS_ROOT, excluded: [], firstRunComplete: true }),
);

// ── Case 1: non-default githubAccountId → GH_CONFIG_DIR injected ──────────────
const acc = githubAccounts.create({ label: "work" });
seedProject("withgh", acc.id);
const injected = resolveSpawnEnv(baseOpts("withgh")).env;
assert.strictEqual(
  injected.GH_CONFIG_DIR,
  acc.configDir,
  `expected GH_CONFIG_DIR=${acc.configDir}, got ${injected.GH_CONFIG_DIR}`,
);
// The whole bug: git ignores GH_CONFIG_DIR, so the env must also carry a
// credential helper (via GIT_CONFIG_*) that resets github.com's helper list and
// routes it through `gh auth git-credential` (which reads GH_CONFIG_DIR).
assert.strictEqual(injected.GIT_CONFIG_COUNT, "2", "expected GIT_CONFIG_COUNT=2");
assert.strictEqual(injected.GIT_CONFIG_KEY_0, "credential.https://github.com.helper");
assert.strictEqual(injected.GIT_CONFIG_VALUE_0, "", "expected an empty reset entry first");
assert.strictEqual(injected.GIT_CONFIG_KEY_1, "credential.https://github.com.helper");
assert.strictEqual(
  injected.GIT_CONFIG_VALUE_1,
  "!gh auth git-credential",
  `expected gh credential helper, got ${injected.GIT_CONFIG_VALUE_1}`,
);

// ── Case 2: no githubAccountId → no injection ────────────────────────────────
seedProject("nogh");
const none = resolveSpawnEnv(baseOpts("nogh")).env;
assert.strictEqual(none.GH_CONFIG_DIR, undefined, "expected no GH_CONFIG_DIR for unset project");
assert.strictEqual(none.GIT_CONFIG_COUNT, undefined, "expected no git credential env for unset project");

// ── Case 3: explicit "default" → no injection ────────────────────────────────
seedProject("defgh", "default");
const def = resolveSpawnEnv(baseOpts("defgh")).env;
assert.strictEqual(def.GH_CONFIG_DIR, undefined, "expected no GH_CONFIG_DIR for default account");
assert.strictEqual(def.GIT_CONFIG_COUNT, undefined, "expected no git credential env for default account");

// ── Case 4: no projectId at all → no injection ───────────────────────────────
const noProject = resolveSpawnEnv(baseOpts()).env;
assert.strictEqual(noProject.GH_CONFIG_DIR, undefined, "expected no GH_CONFIG_DIR without a project");
assert.strictEqual(noProject.GIT_CONFIG_COUNT, undefined, "expected no git credential env without a project");

console.log("ok — resolveSpawnEnv GH_CONFIG_DIR + git credential-helper injection contract holds");
