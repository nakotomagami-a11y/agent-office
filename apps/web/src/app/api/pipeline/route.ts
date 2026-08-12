import { NextResponse } from "next/server";
import { agents, pipeline } from "@agent-office/domain/services";
import { validateBody } from "@/lib/validation";
import { createPipelineRequestSchema } from "@/lib/validation-schemas";
import { badRequest } from "@/lib/api-helpers";
import type { PipelineStep } from "@agent-office/domain/types";

function leafSteps(steps: ReturnType<typeof createPipelineRequestSchema.parse>["steps"]): PipelineStep[] {
  const out: PipelineStep[] = [];
  for (const s of steps) {
    if ("kind" in s && s.kind === "parallel") {
      out.push(...s.steps);
    } else {
      out.push(s as PipelineStep);
    }
  }
  return out;
}

export async function POST(request: Request) {
  const raw: unknown = await request.json();
  const { data: req, error } = validateBody(createPipelineRequestSchema, raw);
  if (error) return error;

  for (const step of leafSteps(req.steps)) {
    const agent = agents.readAgent(step.agentId);
    if (!agent) return badRequest(`unknown agent: ${step.agentId}`);
  }

  const run = pipeline.createPipeline(req);

  return NextResponse.json({ pipelineId: run.id, steps: run.steps }, { status: 202 });
}
