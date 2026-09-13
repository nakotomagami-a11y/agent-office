// Real ("Measure exactly") native-overhead measurements — one row per agent.
// See agents/context-cost-measure.ts for how these get produced.
import { getDb } from "./connection";

export interface AgentContextMeasurement {
  agentId: string;
  ccBaseAndToolsTokens: number;
  mcpTokens: number;
  mcpServerNames: string[];
  measuredAt: number;
}

interface RawRow {
  agent_id: string;
  cc_base_and_tools_tokens: number;
  mcp_tokens: number;
  mcp_server_names: string;
  measured_at: number;
}

function fromRaw(r: RawRow): AgentContextMeasurement {
  let mcpServerNames: string[] = [];
  try {
    const parsed: unknown = JSON.parse(r.mcp_server_names);
    if (Array.isArray(parsed)) mcpServerNames = parsed.filter((x): x is string => typeof x === "string");
  } catch {
    /* malformed — treat as none */
  }
  return {
    agentId: r.agent_id,
    ccBaseAndToolsTokens: r.cc_base_and_tools_tokens,
    mcpTokens: r.mcp_tokens,
    mcpServerNames,
    measuredAt: r.measured_at,
  };
}

export function getAgentContextMeasurement(agentId: string): AgentContextMeasurement | null {
  const row = getDb().prepare("SELECT * FROM agent_context_measurements WHERE agent_id = ?").get(agentId) as RawRow | undefined;
  return row ? fromRaw(row) : null;
}

export function saveAgentContextMeasurement(m: AgentContextMeasurement): void {
  getDb().prepare(`
    INSERT INTO agent_context_measurements (agent_id, cc_base_and_tools_tokens, mcp_tokens, mcp_server_names, measured_at)
    VALUES (@agentId, @ccBaseAndToolsTokens, @mcpTokens, @mcpServerNames, @measuredAt)
    ON CONFLICT(agent_id) DO UPDATE SET
      cc_base_and_tools_tokens = excluded.cc_base_and_tools_tokens,
      mcp_tokens = excluded.mcp_tokens,
      mcp_server_names = excluded.mcp_server_names,
      measured_at = excluded.measured_at
  `).run({
    agentId: m.agentId,
    ccBaseAndToolsTokens: m.ccBaseAndToolsTokens,
    mcpTokens: m.mcpTokens,
    mcpServerNames: JSON.stringify(m.mcpServerNames),
    measuredAt: m.measuredAt,
  });
}
