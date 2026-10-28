// Build the `claude -p` arg list for a summon, applying instance + agent defaults.

import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import type { AgentInstance, ApiAgent, SummonRequest } from "../../types/index";
import * as db from "../db";
import { REPO_SCRIPTS_DIR, TMP_PROMPTS_DIR } from "../infra/paths";

export interface BuiltCommand {
  args: string[];
  /** Prior context + user message, fed over stdin rather than argv: on Windows
   *  argv goes through cmd.exe, which truncates at the first newline and caps
   *  the command line at ~8 KB. `claude -p` reads stdin on every platform. */
  stdin: string;
  model: string;
  effort: string;
  permissionMode?: string;
  systemPromptFile?: string;
  /** Reported, never thrown: this runs in the scheduler tick, where an
   *  exception would skip every other due job. */
  permissionBridgeMissing?: string;
}

// Linux execve() rejects any single argv string over MAX_ARG_STRLEN (128 KiB,
// kernel-enforced regardless of ulimit) as `spawn E2BIG`, and a heavy skill
// loadout blows past it. `--append-system-prompt-file` hands the CLI a path
// instead of the payload.
const TMP_PROMPT_MAX_AGE_MS = 6 * 60 * 60 * 1000; // 6h — generous vs. realistic run duration

/** Best-effort sweep of stale prompt files. Never throws — cleanup is opportunistic. */
function pruneStaleSystemPromptFiles(): void {
  try {
    if (!existsSync(TMP_PROMPTS_DIR)) return;
    const now = Date.now();
    for (const f of readdirSync(TMP_PROMPTS_DIR)) {
      const p = join(TMP_PROMPTS_DIR, f);
      try {
        if (now - statSync(p).mtimeMs > TMP_PROMPT_MAX_AGE_MS) unlinkSync(p);
      } catch {
        /* file may have been removed concurrently — ignore */
      }
    }
  } catch {
    /* non-fatal: worst case tmp-prompts/ grows until the next successful sweep */
  }
}

/** Write `content` to a fresh file under `tmp-prompts/` and return its path. */
function writeSystemPromptFile(content: string): string {
  if (!existsSync(TMP_PROMPTS_DIR)) mkdirSync(TMP_PROMPTS_DIR, { recursive: true });
  pruneStaleSystemPromptFiles();
  const file = join(TMP_PROMPTS_DIR, `${randomUUID()}.md`);
  writeFileSync(file, content, "utf8");
  return file;
}

// A mission seat runs under `--strict-mcp-config`: only the servers we pass, so
// it loses local-scope, project .mcp.json, plugin and claude.ai servers. Its
// user-scope servers are forwarded from here.
function readGlobalMcpServers(): Record<string, unknown> {
  try {
    const raw: unknown = JSON.parse(readFileSync(join(homedir(), ".claude.json"), "utf8"));
    const servers = (raw as { mcpServers?: unknown }).mcpServers;
    return servers && typeof servers === "object" ? (servers as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/** Without `strict` the passed servers are added to everything else the CLI loads. */
function mcpArgs(opts: { strict: boolean; withPermissionServer: boolean }): string[] {
  const servers: Record<string, unknown> = opts.strict ? { ...readGlobalMcpServers() } : {};
  if (opts.withPermissionServer) {
    // AO_RUN_ID / AO_BASE_URL come from the spawn env.
    servers["agent-office"] = { command: process.execPath, args: [PERMISSION_SERVER_PATH] };
  }
  if (!opts.strict && Object.keys(servers).length === 0) return [];
  return [...(opts.strict ? ["--strict-mcp-config"] : []), "--mcp-config", JSON.stringify({ mcpServers: servers })];
}

/** Playwright's tool schemas cost thousands of tokens a turn, so a seat opts in. A run with no
 *  seat of its own has no toggle and follows the agent's declared `mcp__playwright` tools. */
export function playwrightAllowed(instance: AgentInstance | null, agentTools: readonly string[]): boolean {
  if (instance) return instance.playwrightEnabled === true;
  return agentTools.some((t) => t.split("__")[0] === "mcp" && t.split("__")[1] === "playwright");
}

export function disabledMcpServers(instance: AgentInstance | null, agentTools: readonly string[]): string[] {
  return playwrightAllowed(instance, agentTools) ? [] : ["playwright"];
}

/** A server-level deny drops every tool of that server for the agent and its sub-agents (checked
 *  against the CLI's system/init tool list); other servers are untouched. Names are normalised the
 *  way the CLI prefixes tools (`claude.ai Gmail` → `mcp__claude_ai_Gmail`). */
export function disabledMcpArgs(servers: readonly string[]): string[] {
  if (servers.length === 0) return [];
  return ["--disallowedTools", servers.map((name) => `mcp__${name.replace(/[^a-zA-Z0-9_-]/g, "_")}`).join(",")];
}

/** Fully-qualified name of the tool the CLI calls to ask for approval. */
export const PERMISSION_TOOL = "mcp__agent-office__permission_prompt";

/** Stdio MCP bridge that forwards approval requests to the running app. */
export const PERMISSION_SERVER_PATH = join(
  REPO_SCRIPTS_DIR,
  "mcp-permission-server.mjs",
);

/** Any seat can push to a hub branch, so never load its project settings (docs/missions.md, Trust). */
export function isMissionWorktree(instance: AgentInstance | null): boolean {
  if (!instance) return false;
  return (instance.worktree?.branch.startsWith("mission/") ?? false) || db.wasMissionSeat(instance.instanceId);
}

export function buildClaudeArgs(opts: {
  request: SummonRequest;
  agent: ApiAgent;
  instance: AgentInstance | null;
  isolate?: boolean;
  appendedSystemPrompt: string;
  priorContext?: string;
}): BuiltCommand {
  const { request, agent, instance, appendedSystemPrompt, priorContext } = opts;

  const args = [
    "-p",
    "--agent",
    request.agentId,
    "--output-format",
    "stream-json",
    "--include-partial-messages",
    "--verbose",
  ];

  const model = request.model ?? instance?.model ?? agent.defaultModel ?? "default";
  const effort = request.effort ?? instance?.effort ?? agent.defaultEffort ?? "default";
  const permissionMode = instance?.permissionMode ?? agent.permissionMode;

  if (model && model !== "default") args.push("--model", model);
  if (effort && effort !== "default") args.push("--effort", effort);
  if (request.maxBudgetUsd && request.maxBudgetUsd > 0) {
    args.push("--max-budget-usd", String(request.maxBudgetUsd));
  }
  if (permissionMode) args.push("--permission-mode", permissionMode);
  // `-p` has no TTY, so a prompting mode needs a host to ask.
  if (permissionMode && permissionMode !== "bypassPermissions") {
    args.push("--permission-prompt-tool", PERMISSION_TOOL);
  }
  const needsPermissionServer = !!permissionMode && permissionMode !== "bypassPermissions";
  const onHubBranch = opts.isolate ?? isMissionWorktree(instance);
  if (onHubBranch) args.push("--setting-sources", "user");
  args.push(...mcpArgs({ strict: onHubBranch, withPermissionServer: needsPermissionServer }));
  args.push(...disabledMcpArgs(disabledMcpServers(instance, agent.tools ?? [])));
  for (const dir of agent.addDirs ?? []) args.push("--add-dir", dir.replace(/^~/, homedir()));
  let systemPromptFile: string | undefined;
  if (appendedSystemPrompt) {
    systemPromptFile = writeSystemPromptFile(appendedSystemPrompt);
    args.push("--append-system-prompt-file", systemPromptFile);
  }
  if (request.resumeSessionId) args.push("--resume", request.resumeSessionId);

  const stdin = priorContext ? priorContext + request.prompt : request.prompt;

  const permissionBridgeMissing =
    needsPermissionServer && !existsSync(PERMISSION_SERVER_PATH)
      ? PERMISSION_SERVER_PATH
      : undefined;

  return { args, stdin, model, effort, permissionMode, systemPromptFile, permissionBridgeMissing };
}
