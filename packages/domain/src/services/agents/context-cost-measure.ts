// "Measure exactly" — a real (not estimated) split of an agent's native
// overhead into CC base+tools and MCP schemas. Opt-in (a button click):
// spawns real processes, costs a little time/money.
//
// CC base+tools: a one-shot `claude -p` probe with the real appended prompt.
// Its prompt size (cache_read + cache_creation, robust whether that exact
// prompt was a fresh cache write or a hit) minus the known non-native total
// isolates Claude Code's own base prompt + built-in tools.
//
// MCP schemas: measured by connecting to the server directly (stdio
// handshake → tools/list), not a turn-diff on the probe — a `-p` probe's
// MCP connection is still "pending" when a trivial prompt finishes, so a
// turn-diff unreliably reads ~0. The server's own tools/list is
// deterministic; real runs do pay this (developer agents call
// mcp__playwright__* thousands of times).
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import type { Project } from "../../types/index";
import { log } from "../infra/log";
import * as db from "../db";
import { findInstance } from "../projects/projects";
import { estimateTokens } from "../infra/token-estimate";
import { resolveSpawnEnv } from "../execution/runs";
import { buildAppendedPrompt, readAgent } from "./agents";
import { nonNativeKnownTokens, resolveReadonlyCwd } from "./context-cost";

const PROBE_PROMPT = "Reply with only the word OK.";
const PROBE_TIMEOUT_MS = 45_000;
const MCP_HANDSHAKE_TIMEOUT_MS = 25_000;

/** Server names this agent actually loads, parsed from its own `tools:`
 *  frontmatter (e.g. `"mcp__playwright__*"` → `"playwright"`) — NOT every
 *  globally-configured MCP server, which is the bug this feature replaces. */
export function agentMcpServerNames(tools: string[]): string[] {
  const names = new Set<string>();
  for (const t of tools) {
    const parts = t.split("__");
    if (parts.length >= 2 && parts[0] === "mcp") names.add(parts[1]!);
  }
  return Array.from(names);
}

interface ProbeUsage {
  /** cache_read + cache_creation — the sum stays correct whether this prompt
   *  was a fresh cache write or a hit; cache_creation alone reads 0 on a hit. */
  promptTokens: number;
}

/** Spawn one `claude -p` probe turn and pull the final `result` event's
 *  usage out of its stream-json output. */
function runProbeTurn(args: string[], cwd: string, env: NodeJS.ProcessEnv): Promise<ProbeUsage> {
  return new Promise((resolve, reject) => {
    const proc = spawn("claude", args, { cwd, env, stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    let stderr = "";
    const timer = setTimeout(() => {
      try { proc.kill(); } catch { /* already gone */ }
      reject(new Error("context-cost probe timed out"));
    }, PROBE_TIMEOUT_MS);

    proc.stdout.on("data", (d: Buffer) => { out += d.toString(); });
    proc.stderr.on("data", (d: Buffer) => { stderr += d.toString(); });
    proc.on("error", (err) => { clearTimeout(timer); reject(err); });
    proc.on("close", () => {
      clearTimeout(timer);
      for (const line of out.split("\n").reverse()) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          const evt = JSON.parse(trimmed) as {
            type?: string;
            usage?: { cache_creation_input_tokens?: number; cache_read_input_tokens?: number };
          };
          if (evt.type === "result") {
            const created = evt.usage?.cache_creation_input_tokens ?? 0;
            const read = evt.usage?.cache_read_input_tokens ?? 0;
            resolve({ promptTokens: created + read });
            return;
          }
        } catch {
          /* not a JSON line — skip */
        }
      }
      reject(new Error(`context-cost probe produced no result event: ${stderr.slice(0, 300)}`));
    });
  });
}

interface McpServerConfig { command: string; args: string[] }

/** Read the stdio launch config for the named MCP servers from the user's
 *  `~/.claude.json`. Only stdio servers (with a `command`) are probeable —
 *  http/needs-auth ones are skipped. */
function readMcpServerConfigs(names: string[]): Map<string, McpServerConfig> {
  const out = new Map<string, McpServerConfig>();
  try {
    const raw = JSON.parse(readFileSync(join(homedir(), ".claude.json"), "utf8")) as {
      mcpServers?: Record<string, { command?: string; args?: string[] }>;
    };
    for (const name of names) {
      const cfg = raw.mcpServers?.[name];
      if (cfg?.command) out.set(name, { command: cfg.command, args: cfg.args ?? [] });
    }
  } catch {
    /* no config / malformed — nothing to probe */
  }
  return out;
}

/** Connect to one stdio MCP server (initialize → tools/list) and estimate the
 *  token cost of its tool definitions. Resolves 0 on any failure (server not
 *  installed, hangs, needs auth) — best-effort, never throws. */
function probeMcpSchemaTokens(command: string, args: string[]): Promise<number> {
  return new Promise((resolve) => {
    let done = false;
    const finish = (n: number) => { if (!done) { done = true; clearTimeout(timer); try { proc.kill(); } catch { /* gone */ } resolve(n); } };
    const proc = spawn(command, args, { stdio: ["pipe", "pipe", "ignore"] });
    const timer = setTimeout(() => finish(0), MCP_HANDSHAKE_TIMEOUT_MS);
    let buf = "";
    const send = (o: unknown) => { try { proc.stdin.write(JSON.stringify(o) + "\n"); } catch { finish(0); } };

    proc.on("error", () => finish(0));
    proc.stdout.on("data", (d: Buffer) => {
      buf += d.toString();
      let idx: number;
      while ((idx = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, idx).trim();
        buf = buf.slice(idx + 1);
        if (!line) continue;
        let msg: { id?: number; result?: { tools?: unknown[] } };
        try { msg = JSON.parse(line); } catch { continue; }
        if (msg.id === 1) {
          send({ jsonrpc: "2.0", method: "notifications/initialized" });
          send({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} });
        } else if (msg.id === 2 && msg.result) {
          finish(estimateTokens(JSON.stringify(msg.result.tools ?? [])));
        }
      }
    });

    send({
      jsonrpc: "2.0", id: 1, method: "initialize",
      params: { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "ao-context-cost", version: "0.0.0" } },
    });
  });
}

async function measureMcpTokens(serverNames: string[]): Promise<Record<string, number>> {
  const configs = readMcpServerConfigs(serverNames);
  const out: Record<string, number> = {};
  for (const [name, cfg] of configs) {
    try {
      out[name] = await probeMcpSchemaTokens(cfg.command, cfg.args);
    } catch (err) {
      log.warn("context_cost.mcp_schema_probe_failed", { server: name, err: String(err) });
    }
  }
  return out;
}

export async function measureAgentContextCost(
  agentId: string,
  instanceId: string | undefined,
  project: Project | null,
): Promise<db.AgentContextMeasurement> {
  const agent = readAgent(agentId);
  if (!agent) throw new Error(`agent not found: ${agentId}`);
  const model = agent.info.defaultModel && agent.info.defaultModel !== "default" ? agent.info.defaultModel : "sonnet";

  // Same cwd as a real run, so Claude Code discovers the same CLAUDE.md/
  // AGENTS.md we subtract below — otherwise the split is off by their size.
  const instance = findInstance(project, instanceId);
  const resolved = resolveReadonlyCwd(project, instance);
  const cwd = resolved && existsSync(resolved) ? resolved : process.cwd();

  const { env } = resolveSpawnEnv({
    agentId, agentName: agent.info.name, prompt: "", model, effort: "default", args: [],
    projectId: project?.id,
  });

  const appendedPrompt = buildAppendedPrompt(agentId, project, undefined, false);
  const tmpDir = mkdtempSync(join(tmpdir(), "ao-context-cost-probe-"));
  const promptFile = join(tmpDir, "system-prompt.md");
  writeFileSync(promptFile, appendedPrompt, "utf8");

  // Same --add-dir flags as buildClaudeArgs, for the same reason.
  const addDirArgs = (agent.info.addDirs ?? []).flatMap((d) => ["--add-dir", d.replace(/^~/, homedir())]);

  try {
    const probe = await runProbeTurn(
      ["-p", "--output-format", "stream-json", "--verbose",
       "--agent", agentId, "--model", model, "--permission-mode", "bypassPermissions",
       ...addDirArgs, "--append-system-prompt-file", promptFile, "--", PROBE_PROMPT],
      cwd, env,
    );

    // Subtract the same accurate non-native total the estimate path uses,
    // leaving CC base + built-in tools (MCP is still connecting, so absent
    // from the probe — measured separately below).
    const knownTokens = nonNativeKnownTokens(agentId, project, cwd, agent.info.addDirs ?? []);
    const ccBaseAndToolsTokens = Math.max(0, probe.promptTokens - knownTokens);

    const mcpServerNames = agentMcpServerNames(agent.info.tools ?? []);
    const mcpTokensByServer = mcpServerNames.length > 0 ? await measureMcpTokens(mcpServerNames) : {};

    const measurement: db.AgentContextMeasurement = {
      agentId, ccBaseAndToolsTokens, mcpTokensByServer, measuredAt: Date.now(),
    };
    db.saveAgentContextMeasurement(measurement);
    return measurement;
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
}
