// POST /api/loops — start a loop. The agent drives each round's content; the
// app owns the ceilings, so they are validated here and never taken on trust.
import { loopRunner, loopProductionRunner } from "@agent-office/domain/services";
import { validateBody } from "@/lib/validation";
import { startLoopSchema } from "@/lib/validation-schemas";
import { tryService } from "@/lib/api-helpers";

export async function POST(request: Request) {
  const raw: unknown = await request.json();
  const { data, error } = validateBody(startLoopSchema, raw);
  if (error) return error;
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
