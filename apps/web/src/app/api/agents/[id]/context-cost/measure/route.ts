// POST /api/agents/<id>/context-cost/measure { projectId? } — "Measure
// exactly": spawns a real, throwaway probe session and diffs its actual
// cache-write usage to split native overhead into "CC base + built-in tools"
// vs. real per-agent MCP cost. Explicit user action only (a button click) —
// costs a little real money and ~10-15s. See `@agent-office/domain`
// services/agents/context-cost-measure.ts.
import { contextCost, projects } from "@agent-office/domain/services";
import { validateIdParam, tryService } from "@/lib/api-helpers";
import { validateBody } from "@/lib/validation";
import { contextCostMeasureBodySchema } from "@/lib/validation-schemas";

type Params = { params: Promise<{ id: string }> };

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(request: Request, { params }: Params) {
  const { value: agentId, error: idError } = validateIdParam((await params).id);
  if (idError) return idError;

  const raw: unknown = await request.json().catch(() => ({}));
  const { data, error } = validateBody(contextCostMeasureBodySchema, raw);
  if (error) return error;

  const project = data.projectId ? projects.readProject(data.projectId) : null;

  return tryService(() => contextCost.measureAgentContextCost(agentId, data.instanceId, project));
}
