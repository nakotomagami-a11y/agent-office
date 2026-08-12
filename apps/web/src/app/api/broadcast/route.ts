import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { agents, projects, runs, summon } from "@agent-office/domain/services";
import { validateBody } from "@/lib/validation";
import { broadcastRequestSchema } from "@/lib/validation-schemas";
import { badRequest } from "@/lib/api-helpers";

type Roster = ReturnType<typeof projects.readProject> extends { meta: { roster: infer R } } | null ? R : never;
type RosterInst = Roster extends readonly (infer I)[] ? I : never;

function startRunForRosterInstance(
  inst: RosterInst,
  project: NonNullable<ReturnType<typeof projects.readProject>>,
  req: { agentId?: string; prompt: string; model?: string; effort?: string; cwd?: string; projectId: string },
): string | null {
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
  return runId;
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

  const broadcastId = randomUUID();
  const runIds: string[] = [];
  for (const inst of roster) {
    const runId = startRunForRosterInstance(inst, project, req);
    if (runId) runIds.push(runId);
  }

  return NextResponse.json({ broadcastId, runIds }, { status: 202 });
}
