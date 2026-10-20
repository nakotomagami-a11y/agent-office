/**
 * Which GitHub identity an agent run (resolveSpawnEnv) and the review's gh calls (ghEnv) act as.
 * gh prefers a token in the environment over GH_CONFIG_DIR, so a project pinned to a GitHub
 * account must not inherit the app's own GH_TOKEN; a token the project links as a secret is the
 * user's explicit choice and wins.
 *
 *   pnpm --filter @agent-office/domain test src/services/execution/runs/spawn-env.test.ts
 */
import assert from "node:assert";
import { test } from "node:test";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// $HOME must point at a sandbox BEFORE importing anything that resolves paths.
const sandbox = mkdtempSync(join(tmpdir(), "ao-spawnenv-"));
process.env.HOME = sandbox;
process.env.USERPROFILE = sandbox; // os.homedir() reads this on Windows, not HOME

const claudeDir = join(sandbox, ".claude");
const projectsRoot = join(sandbox, "root");
mkdirSync(join(claudeDir, "projects"), { recursive: true });
writeFileSync(join(claudeDir, "agent-office-settings.json"), JSON.stringify({ projectsRoot, excluded: [], firstRunComplete: true }));

const { resolveSpawnEnv } = await import("./spawn-env");
const { ghEnv } = await import("../../review/gh");
const projects = await import("../../projects/projects");
const githubAccounts = await import("../../accounts/github-accounts");
const secrets = await import("../../accounts/secrets");

const account = githubAccounts.create({ label: "Work" });
const SUB = { provider: "subscription" } as const;

function project(id: string, githubAccountId?: string) {
  mkdirSync(join(projectsRoot, id), { recursive: true });
  mkdirSync(join(claudeDir, "projects", id), { recursive: true });
  writeFileSync(join(claudeDir, "projects", id, "project.md"),
    `---\nname: "${id}"\nroster: []\n${githubAccountId ? `githubAccountId: ${githubAccountId}\n` : ""}---\n`);
  return projects.readProject(id)!;
}

function withInherited<T>(fn: () => T): T {
  const saved = { GH_TOKEN: process.env.GH_TOKEN, Github_Token: process.env.Github_Token };
  process.env.GH_TOKEN = "inherited";
  process.env.Github_Token = "inherited-other-case";
  try {
    return fn();
  } finally {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
}

const tokens = (env: NodeJS.ProcessEnv) =>
  Object.keys(env).filter((k) => /^(GH|GITHUB)_TOKEN$/i.test(k)).map((k) => `${k}=${env[k]}`).sort();

test("pinned to a GitHub account: inherited tokens are dropped, whatever their case", () => {
  const p = project("pinned", account.id);
  withInherited(() => {
    const run = resolveSpawnEnv({ projectId: p.id } as Parameters<typeof resolveSpawnEnv>[0], SUB).env;
    assert.equal(run.GH_CONFIG_DIR, account.configDir);
    assert.deepEqual(tokens(run), []);
    const gh = ghEnv(p);
    assert.equal(gh.GH_CONFIG_DIR, account.configDir);
    assert.deepEqual(tokens(gh), []);
  });
});

test("not pinned: the inherited token is kept (the system gh identity)", () => {
  const p = project("unpinned");
  withInherited(() => {
    assert.ok(tokens(resolveSpawnEnv({ projectId: p.id } as Parameters<typeof resolveSpawnEnv>[0], SUB).env).includes("GH_TOKEN=inherited"));
    assert.ok(tokens(ghEnv(p)).includes("GH_TOKEN=inherited"));
  });
});

test("a GH_TOKEN the project links as a secret wins over the pinned account", () => {
  const p = project("with-secret", account.id);
  const s = secrets.create({ name: "GH_TOKEN", value: "from-secret" });
  secrets.link(p.id, s.id);
  withInherited(() => {
    assert.deepEqual(tokens(resolveSpawnEnv({ projectId: p.id } as Parameters<typeof resolveSpawnEnv>[0], SUB).env), ["GH_TOKEN=from-secret"]);
    assert.deepEqual(tokens(ghEnv(p)), ["GH_TOKEN=from-secret"]);
  });
});

function withEnv<T>(vars: Record<string, string>, fn: () => T): T {
  const saved = Object.fromEntries(Object.keys(vars).map((k) => [k, process.env[k]]));
  Object.assign(process.env, vars);
  try {
    return fn();
  } finally {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
}

test("inherited backend env never reaches a run; OPENAI_* and CLAUDE_CONFIG_DIR do", () => {
  const p = project("scrubbed");
  const inherited = {
    ANTHROPIC_BASE_URL: "http://evil", ANTHROPIC_API_KEY: "sk-inherited", ANTHROPIC_FUTURE_THING: "1",
    CLAUDE_CODE_OAUTH_TOKEN: "t", CLAUDE_CODE_USE_VERTEX: "1", CLAUDECODE: "1",
    OPENAI_API_KEY: "kept", CLAUDE_CONFIG_DIR: join(sandbox, "inherited-config"),
  };
  withEnv(inherited, () => {
    const env = resolveSpawnEnv({ projectId: p.id } as Parameters<typeof resolveSpawnEnv>[0], SUB).env;
    for (const name of ["ANTHROPIC_BASE_URL", "ANTHROPIC_API_KEY", "ANTHROPIC_FUTURE_THING", "CLAUDE_CODE_OAUTH_TOKEN", "CLAUDE_CODE_USE_VERTEX", "CLAUDECODE"]) {
      assert.equal(env[name], undefined, name);
    }
    assert.equal(env.OPENAI_API_KEY, "kept");
    assert.equal(env.CLAUDE_CONFIG_DIR, inherited.CLAUDE_CONFIG_DIR);
  });
});

test("a project secret cannot change the backend; the provider is applied last", () => {
  const p = project("hostile-secret");
  for (const [name, value] of [["ANTHROPIC_BASE_URL", "http://evil"], ["anthropic_auth_token", "evil"], ["OPENAI_API_KEY", "project-own"]]) {
    secrets.link(p.id, secrets.create({ name: name!, value: value! }).id);
  }
  const { env, secretValues } = resolveSpawnEnv(
    { projectId: p.id } as Parameters<typeof resolveSpawnEnv>[0],
    { provider: "openai", gatewayUrl: "http://127.0.0.1:3000/api/gateway", token: "run-token", models: { haiku: "h", sonnet: "s", opus: "o" } },
  );
  assert.equal(env.ANTHROPIC_BASE_URL, "http://127.0.0.1:3000/api/gateway");
  assert.equal(env.ANTHROPIC_AUTH_TOKEN, "run-token");
  assert.equal(env.anthropic_auth_token, undefined);
  assert.equal(env.OPENAI_API_KEY, "project-own");
  assert.ok(!secretValues.includes("http://evil"));
});

test("reserved secrets are flagged for the Secrets UI", () => {
  const listed = secrets.list();
  assert.equal(listed.find((s) => s.name === "ANTHROPIC_BASE_URL")?.reserved, true);
  assert.equal(listed.find((s) => s.name === "OPENAI_API_KEY")?.reserved, false);
});
