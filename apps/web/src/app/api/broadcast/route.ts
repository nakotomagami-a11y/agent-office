// POST /api/broadcast — start a background run for every agent on a project's
// roster (build claude args + startRun per instance), outside the summon flow.
import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { agents, projects, runs, summon } from "@agent-office/domain/services";
import type { AgentInstance, Project } from "@agent-office/domain/types";
import { validateBody } from "@/lib/validation";
import { broadcastRequestSchema } from "@/lib/validation-schemas";
import { badRequest } from "@/lib/api-helpers";
import { log } from "@agent-office/domain/services/infra/log";
import { existsSync } from "node:fs";
import { PERMISSION_SERVER_PATH } from "@agent-office/domain/services/execution/summon";

function startRunForRosterInstance(
  inst: AgentInstance,
  project: Project,
  req: { agentId?: string; prompt: string; model?: string; effort?: string; cwd?: string; projectId: string },
): { runId: string } | { bridgeMissing: string } | null {
  const agentResult = agents.readAgent(inst.agentId);
  if (!agentResult) return null;

  const instance = projects.findInstance(project, inst.instanceId);
  const appendedSystemPrompt = agents.buildAppendedPrompt(inst.agentId, project, inst.instanceId);

  const built = summon.buildClaudeArgs({
    request: {
      agentId: inst.agentId,
      prompt: req.prompt,
      model: req.model ?? inst.model,
      effort: req.effort ?? inst.effort,
      cwd: req.cwd,
      projectId: req.projectId,
      instanceId: inst.instanceId,
    },
    agent: agentResult.info,
    instance,
    appendedSystemPrompt,
  });

  if (built.permissionBridgeMissing) return { bridgeMissing: built.permissionBridgeMissing };

  const instanceLabel = inst.label ?? agentResult.info.name;

  const { runId } = runs.startRun({
    agentId: inst.agentId,
    agentName: instanceLabel,
    prompt: req.prompt,
    model: built.model,
    effort: built.effort,
    cwd: req.cwd,
    projectId: req.projectId,
    instanceId: inst.instanceId,
    instanceLabel,
    args: built.args,
  });
  return { runId };
}

export async function POST(request: Request) {
  const raw: unknown = await request.json();
  const { data: req, error } = validateBody(broadcastRequestSchema, raw);
  if (error) return error;

  const project = projects.readProject(req.projectId);
  if (!project) return badRequest(`unknown project: ${req.projectId}`);

  const { roster } = project.meta;
  if (roster.length === 0) {
    return NextResponse.json({ error: "roster_empty", detail: "Project has no agents on roster" }, { status: 400 });
  }

  // Before ANY spawn: a mixed roster would already be running when this 500s.
  if (!existsSync(PERMISSION_SERVER_PATH)) {
    log.error("broadcast.permission_bridge_missing", { projectId: req.projectId, path: PERMISSION_SERVER_PATH });
    return NextResponse.json(
      { error: "permission_bridge_missing", detail: `Permission bridge not found at ${PERMISSION_SERVER_PATH}` },
      { status: 500 },
    );
  }

  const broadcastId = randomUUID();
  const runIds: string[] = [];
  for (const inst of roster) {
    const outcome = startRunForRosterInstance(inst, project, req);
    if (!outcome) continue;
    if ("bridgeMissing" in outcome) {
      log.error("broadcast.permission_bridge_missing", { projectId: req.projectId, path: outcome.bridgeMissing });
      return NextResponse.json(
        { error: "permission_bridge_missing", detail: `Permission bridge not found at ${outcome.bridgeMissing}` },
        { status: 500 },
      );
    }
    runIds.push(outcome.runId);
  }

  return NextResponse.json({ broadcastId, runIds }, { status: 202 });
}
