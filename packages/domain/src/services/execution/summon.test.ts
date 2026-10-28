import assert from "node:assert";
import { writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import type { AgentInstance, ApiAgent } from "../../types/index";
import { buildClaudeArgs, disabledMcpArgs } from "./summon";

const agent: ApiAgent = { id: "developer", name: "developer", description: "", skills: [], tools: [], permissionMode: "bypassPermissions" };
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

test("another agent borrowing a seat's worktree is isolated too", () => {
  const a = buildClaudeArgs({ request: { agentId: "qa-code-review", prompt: "hi" }, agent, instance: null, isolate: true, appendedSystemPrompt: "" }).args;
  assert.ok(a.includes("--setting-sources") && a.includes("--strict-mcp-config"));
});

// CLI 2.1.296: `--agent qa_bot` is "not found" when qa_bot.md says `name: Reviewer`; `--agent Reviewer` loads it.
test("the CLI is asked for the agent by its frontmatter name, not its file id", () => {
  const a = buildClaudeArgs({
    request: { agentId: "qa_bot", prompt: "hi" }, agent: { ...agent, id: "qa_bot", name: "Reviewer" }, instance: null, appendedSystemPrompt: "",
  }).args;
  assert.equal(a[a.indexOf("--agent") + 1], "Reviewer");
});

// Product decision: Playwright is opt-in per seat, and its toggle touches no other MCP server.
// Excluding it once forced --strict-mcp-config, which drops local-scope, project .mcp.json,
// plugin and claude.ai servers; so did every prompting permission mode.
const withMode = (inst: AgentInstance | null, permissionMode: string) =>
  buildClaudeArgs({ request: { agentId: "developer", prompt: "hi" }, agent: { ...agent, permissionMode }, instance: inst, appendedSystemPrompt: "" }).args;
const ordinary = () => instance("agent/developer-abc-1");
const flagValue = (a: string[], flag: string) => (a.includes(flag) ? a[a.indexOf(flag) + 1] : undefined);
const passedServers = (a: string[]) => {
  const raw = flagValue(a, "--mcp-config");
  if (raw === undefined) return null;
  const config: unknown = JSON.parse(raw);
  const mcp = config && typeof config === "object" && "mcpServers" in config ? config.mcpServers : null;
  return mcp && typeof mcp === "object" ? Object.keys(mcp).sort() : null;
};

test("Playwright off by default denies only Playwright's tools; every other server is left to the CLI", () => {
  writeFileSync(join(homedir(), ".claude.json"), JSON.stringify({
    mcpServers: { playwright: { command: "pw" }, unreal: { command: "ue" } },
    projects: { "/p/.worktrees/developer-abc": { mcpServers: { blender: { command: "bl" } } } },
  }));
  for (const a of [args(null), args(ordinary()), args({ ...ordinary(), playwrightEnabled: false })]) {
    assert.ok(!a.includes("--strict-mcp-config"), "the local-scope blender and top-level unreal servers stay loaded");
    assert.equal(passedServers(a), null, "nothing is re-declared, so nothing can be dropped");
    assert.equal(flagValue(a, "--disallowedTools"), "mcp__playwright");
  }
});

test("Playwright on adds no deny", () => {
  const a = args({ ...ordinary(), playwrightEnabled: true });
  assert.ok(!a.includes("--disallowedTools"));
  assert.ok(!a.includes("--strict-mcp-config"));
});

test("a prompting permission mode adds the bridge without replacing the other servers", () => {
  const a = withMode(ordinary(), "acceptEdits");
  assert.ok(!a.includes("--strict-mcp-config"));
  assert.deepStrictEqual(passedServers(a), ["agent-office"]);
  assert.equal(flagValue(a, "--disallowedTools"), "mcp__playwright");
});

test("a mission seat stays strict: user-scope servers forwarded, Playwright still denied by name", () => {
  writeFileSync(join(homedir(), ".claude.json"), JSON.stringify({ mcpServers: { playwright: { command: "pw" }, unreal: { command: "ue" } } }));
  const a = withMode(instance("mission/k3f9q2--developer-abc"), "acceptEdits");
  assert.ok(a.includes("--strict-mcp-config"));
  assert.deepStrictEqual(passedServers(a), ["agent-office", "playwright", "unreal"]);
  assert.equal(flagValue(a, "--disallowedTools"), "mcp__playwright");
});

test("server names are denied the way the CLI prefixes their tools", () => {
  assert.deepStrictEqual(disabledMcpArgs([]), []);
  assert.deepStrictEqual(disabledMcpArgs(["playwright", "claude.ai Gmail", "my-server"]),
    ["--disallowedTools", "mcp__playwright,mcp__claude_ai_Gmail,mcp__my-server"]);
});

test("a run with no seat of its own follows the agent's declaration; a seat must opt in", () => {
  const declaring: ApiAgent = { ...agent, tools: ["Read", "mcp__playwright__browser_navigate"] };
  const build = (a: ApiAgent, inst: AgentInstance | null) =>
    buildClaudeArgs({ request: { agentId: "developer", prompt: "hi" }, agent: a, instance: inst, appendedSystemPrompt: "" }).args;
  assert.ok(!build(declaring, null).includes("--disallowedTools"), "seat-less + declared: allowed");
  assert.equal(flagValue(build(agent, null), "--disallowedTools"), "mcp__playwright", "seat-less + not declared: denied");
  assert.equal(flagValue(build(declaring, ordinary()), "--disallowedTools"), "mcp__playwright", "seat, never set: denied");
  assert.ok(!build(declaring, { ...ordinary(), playwrightEnabled: true }).includes("--disallowedTools"), "seat on: allowed");
});

