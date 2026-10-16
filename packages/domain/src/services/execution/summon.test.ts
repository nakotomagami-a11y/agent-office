import assert from "node:assert";
import { test } from "node:test";
import type { AgentInstance, ApiAgent } from "../../types/index";
import { buildClaudeArgs } from "./summon";

const agent: ApiAgent = { name: "developer", description: "", skills: [], tools: [], permissionMode: "bypassPermissions" };
const instance = (branch: string): AgentInstance => ({
  instanceId: "developer-abc", agentId: "developer", worktree: { branch, basePath: "/p/.worktrees/developer-abc", createdAt: 1 },
});
const args = (inst: AgentInstance | null) =>
  buildClaudeArgs({ request: { agentId: "developer", prompt: "hi" }, agent, instance: inst, appendedSystemPrompt: "" }).args;

test("a mission seat ignores the hub branch's project settings and MCP servers", () => {
  const a = args(instance("mission/k3f9q2--developer-abc"));
  assert.deepStrictEqual(a.slice(a.indexOf("--setting-sources"), a.indexOf("--setting-sources") + 2), ["--setting-sources", "user"]);
  assert.ok(a.includes("--strict-mcp-config"));
});

test("an ordinary worktree keeps the project's settings", () => {
  assert.ok(!args(instance("agent/developer-abc-1")).includes("--setting-sources"));
  assert.ok(!args(null).includes("--setting-sources"));
});
