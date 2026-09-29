/**
 * The project map replaces facts that were previously hand-typed into agent
 * bodies — where they went stale (D3: `MAIN=/path/to/agent-office`, a
 * placeholder that was never filled in). These assert it stays derived.
 */
import assert from "node:assert";
import { test } from "node:test";
import { resolve } from "node:path";
import { buildProjectMap, readSystemGhUser } from "./project-map";
import type { AgentInstance, Project } from "../../types/index";

const REPO = resolve(import.meta.dirname, "../../../../..");

function projectAt(cwd: string | undefined): Project {
  return { id: "t", meta: { name: "T", description: "", cwd, roster: [] }, memory: "" } as unknown as Project;
}

test("returns null when the project has no cwd on disk", () => {
  assert.equal(buildProjectMap({ project: projectAt(undefined) }), null);
  assert.equal(buildProjectMap({ project: projectAt("/nope/does/not/exist") }), null);
});

test("reports layout, commands and live git state", () => {
  const map = buildProjectMap({ project: projectAt(REPO) });
  assert.ok(map, "expected a map for the repo root");
  assert.match(map, /- Layout: .*packages/);
  assert.match(map, /- Commands \(/);
  assert.match(map, /- Git: on `/);
});

test("never emits a placeholder path", () => {
  const map = buildProjectMap({ project: projectAt(REPO) }) ?? "";
  assert.ok(!map.includes("/path/to/"), "a placeholder path is the D3 defect");
});

test("worktree facts name the real main checkout, not a placeholder", () => {
  const instance = {
    instanceId: "i", agentId: "developer",
    worktree: { branch: "agent/i-1", basePath: `${REPO}/.worktrees/i`, createdAt: 0 },
  } as AgentInstance;
  const map = buildProjectMap({ project: projectAt(REPO), instance }) ?? "";
  assert.match(map, /You are in a git worktree/);
  assert.ok(map.includes(REPO), "must name the real main checkout path");
  assert.match(map, /agent\/i-1/);
});

test("commands are deduplicated", () => {
  const line = (buildProjectMap({ project: projectAt(REPO) }) ?? "")
    .split("\n").find((l) => l.startsWith("- Commands")) ?? "";
  const argvs = [...line.matchAll(/`([^`]+)`/g)].map((m) => m[1]);
  assert.equal(new Set(argvs).size, argvs.length, "monorepos report one script per package");
});

test("readSystemGhUser returns a login or null, never a token", () => {
  const u = readSystemGhUser();
  if (u !== null) {
    assert.ok(u.length < 64 && !u.includes(" "), "should be a login");
    assert.ok(!/^gh[pousr]_/.test(u), "must never surface a token");
  }
});
