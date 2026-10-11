// About You — user analysis endpoint.
//
// GET   → returns the current ~/.claude/agent-office/user_analysis.md as
//         { markdown, updatedAt, wordCount }. Empty-fields on first run.
// POST  → dispatches the `user-analyst` agent (Opus / high effort), in no
//         project: it reads absolute paths. The agent overwrites user_analysis.md;
//         the client polls /api/runs/:id until status !== "running", then
//         refetches GET to render the new markdown.
//
// Dispatch reuses the same pattern as /api/summon so a card appears in the
// office chat panel while regeneration is in flight.

import {
  agents,
  runs,
  store,
  summon,
  userAnalysis,
} from "@agent-office/domain/services";
import { log } from "@agent-office/domain/services/infra/log";
import { badRequest, serverError, requireIntegration } from "../../lib/api-helpers";

const AGENT_ID = "user-analyst";
const REGEN_PROMPT =
  "Regenerate the user analysis. Read all sources per your system prompt. Write to ~/.claude/agent-office/user_analysis.md.";

export async function GET() {
  const gate = requireIntegration("about-you");
  if (gate) return gate;
  try {
    return Response.json(userAnalysis.readUserAnalysis());
  } catch (e) {
    log.warn("user_analysis.read_failed", { err: String(e) });
    return serverError("user_analysis_read_failed");
  }
}

export async function POST() {
  const gate = requireIntegration("about-you");
  if (gate) return gate;
  const agent = agents.readAgent(AGENT_ID);
  if (!agent) return badRequest("agent_not_installed");

  const appendedSystemPrompt = agents.buildAppendedPrompt(AGENT_ID, null, undefined, false);

  const built = summon.buildClaudeArgs({
    request: {
      agentId: AGENT_ID,
      prompt: REGEN_PROMPT,
      model: agent.info.defaultModel ?? "opus",
      effort: agent.info.defaultEffort ?? "high",
    },
    agent: agent.info,
    instance: null,
    appendedSystemPrompt,
  });

  if (built.permissionBridgeMissing) {
    return Response.json(
      { error: "permission_bridge_missing", path: built.permissionBridgeMissing },
      { status: 500 },
    );
  }

  store.pushRecentPrompt(AGENT_ID, REGEN_PROMPT);

  try {
    const { runId } = runs.startRun({
      agentId: AGENT_ID,
      agentName: agent.info.name,
      prompt: REGEN_PROMPT,
      model: built.model,
      effort: built.effort,
      args: built.args,
      stdin: built.stdin,
    });
    return Response.json({ runId, status: "started" });
  } catch (e) {
    log.warn("user_analysis.dispatch_failed", { err: String(e) });
    return serverError("user_analysis_dispatch_failed");
  }
}
