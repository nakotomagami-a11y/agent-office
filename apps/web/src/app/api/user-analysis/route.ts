// About You — user analysis endpoint.
//
// GET   → returns the current ~/.claude/agent-office/user_analysis.md as
//         { markdown, updatedAt, wordCount }. Empty-fields on first run.
// POST  → dispatches the `user-analyst` agent (Opus / high effort) against
//         the agent-office project. The agent overwrites user_analysis.md;
//         the client polls /api/runs/:id until status !== "running", then
//         refetches GET to render the new markdown.
//
// Dispatch reuses the same pattern as /api/summon so a card appears in the
// office chat panel while regeneration is in flight.

import { NextResponse } from "next/server";
import {
  agents,
  projects,
  runs,
  store,
  summon,
  userAnalysis,
} from "@agent-office/domain/services";
import { log } from "@agent-office/domain/services/log";
import { badRequest, serverError } from "@/lib/api-helpers";

const AGENT_ID = "user-analyst";
const PROJECT_ID = "agent-office";
const REGEN_PROMPT =
  "Regenerate the user analysis. Read all sources per your system prompt. Write to ~/.claude/agent-office/user_analysis.md.";

export async function GET() {
  try {
    return NextResponse.json(userAnalysis.readUserAnalysis());
  } catch (e) {
    log.warn("user_analysis.read_failed", { err: String(e) });
    return serverError("user_analysis_read_failed");
  }
}

export async function POST() {
  const agent = agents.readAgent(AGENT_ID);
  if (!agent) return badRequest(`agent not installed: ${AGENT_ID}`);

  // Fall back to no project if agent-office isn't registered — user-analyst
  // reads absolute paths, so it doesn't need a cwd, but wiring it to the
  // agent-office project keeps the run visible on the office chat panel.
  const project = projects.readProject(PROJECT_ID);
  const cwd = project?.meta.cwd;

  const appendedSystemPrompt = agents.buildAppendedPrompt(
    AGENT_ID,
    project,
    undefined,
    false,
  );

  const built = summon.buildClaudeArgs({
    request: {
      agentId: AGENT_ID,
      prompt: REGEN_PROMPT,
      model: agent.info.defaultModel ?? "opus",
      effort: agent.info.defaultEffort ?? "high",
      projectId: project?.id,
    },
    agent: agent.info,
    instance: null,
    appendedSystemPrompt,
  });

  store.pushRecentPrompt(AGENT_ID, REGEN_PROMPT);

  try {
    const { runId } = runs.startRun({
      agentId: AGENT_ID,
      agentName: agent.info.name,
      prompt: REGEN_PROMPT,
      model: built.model,
      effort: built.effort,
      cwd,
      projectId: project?.id,
      args: built.args,
    });
    return NextResponse.json({ runId, status: "started" });
  } catch (e) {
    log.warn("user_analysis.dispatch_failed", { err: String(e) });
    return serverError("user_analysis_dispatch_failed");
  }
}
