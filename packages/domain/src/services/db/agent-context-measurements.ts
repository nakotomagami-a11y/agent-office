// Real ("Measure exactly") native-overhead measurements — one row per agent.
// See agents/context-cost-measure.ts for how these get produced.
import { getDb } from "./connection";

export interface AgentContextMeasurement {
  agentId: string;
  ccBaseAndToolsTokens: number;
  mcpTokensByServer: Record<string, number>;
  measuredAt: number;
}

interface RawRow {
  agent_id: string;
  cc_base_and_tools_tokens: number;
  mcp_tokens_by_server: string;
  measured_at: number;
}

function fromRaw(r: RawRow): AgentContextMeasurement {
  let mcpTokensByServer: Record<string, number> = {};
  try {
    const parsed: unknown = JSON.parse(r.mcp_tokens_by_server);
    if (parsed && typeof parsed === "object") mcpTokensByServer = parsed as Record<string, number>;
  } catch {
    /* malformed — treat as none */
  }
  return {
    agentId: r.agent_id,
    ccBaseAndToolsTokens: r.cc_base_and_tools_tokens,
    mcpTokensByServer,
    measuredAt: r.measured_at,
  };
}

export function getAgentContextMeasurement(agentId: string): AgentContextMeasurement | null {
  const row = getDb().prepare("SELECT * FROM agent_context_measurements WHERE agent_id = ?").get(agentId) as RawRow | undefined;
  return row ? fromRaw(row) : null;
}

export function saveAgentContextMeasurement(m: AgentContextMeasurement): void {
  getDb().prepare(`
    INSERT INTO agent_context_measurements (agent_id, cc_base_and_tools_tokens, mcp_tokens_by_server, measured_at)
    VALUES (@agentId, @ccBaseAndToolsTokens, @mcpTokensByServer, @measuredAt)
    ON CONFLICT(agent_id) DO UPDATE SET
      cc_base_and_tools_tokens = excluded.cc_base_and_tools_tokens,
      mcp_tokens_by_server = excluded.mcp_tokens_by_server,
      measured_at = excluded.measured_at
  `).run({
    agentId: m.agentId,
    ccBaseAndToolsTokens: m.ccBaseAndToolsTokens,
    mcpTokensByServer: JSON.stringify(m.mcpTokensByServer),
    measuredAt: m.measuredAt,
  });
}
