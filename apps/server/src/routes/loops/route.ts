// GET  /api/loops?projectId=<id>&instanceId=<id> — that seat's latest loop, or null (the chat header's pill).
// POST /api/loops — start a loop. The agent drives each round's content; the
// app owns the ceilings, so they are validated here and never taken on trust.
import { loopRunner, loopProductionRunner, db } from "@agent-office/domain/services";
import { validateBody } from "../../lib/validation";
import { startLoopSchema } from "@agent-office/api-contract";
import { tryService, validateIdParam } from "../../lib/api-helpers";

export async function GET(request: Request) {
  const query = new URL(request.url).searchParams;
  const project = validateIdParam(query.get("projectId") ?? "");
  if (project.error) return project.error;
  const instance = validateIdParam(query.get("instanceId") ?? "");
  if (instance.error) return instance.error;
  return tryService(() => db.latestLoopForInstance(project.value, instance.value));
}

export async function POST(request: Request) {
  const raw: unknown = await request.json();
  const { data, error } = validateBody(startLoopSchema, raw);
  if (error) return error;
  // The author's rounds run AS that conversation's agent, so it must be this loop's.
  if (data.conversationId) {
    const conv = db.getConversation(data.conversationId);
    const mismatch = !conv || conv.agentId !== data.agentId
      || (data.instanceId !== undefined && conv.instanceId !== data.instanceId)
      || (data.projectId !== undefined && conv.projectId !== data.projectId);
    if (mismatch) {
      return Response.json({
        error: "conversation_mismatch",
        detail: "conversationId must be a chat of this loop's agent, seat and project. Omit it to run the loop outside any chat.",
      }, { status: 400 });
    }
  }
  return tryService(async () => ({
    id: await loopRunner.startLoop(
      {
        agentId: data.agentId,
        reviewerAgentId: data.reviewerAgentId,
        instanceId: data.instanceId ?? null,
        projectId: data.projectId ?? null,
        conversationId: data.conversationId ?? null,
        cwd: data.cwd ?? null,
        goal: data.goal,
        config: {
          maxRounds: data.maxRounds,
          budgetUsd: data.budgetUsd,
          wallClockMs: data.wallClockMs,
        },
      },
      loopProductionRunner.productionLoopRunner,
      Date.now(),
    ),
  }));
}
