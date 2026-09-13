// GET /api/agents/<id>/context-cost?instanceId=&projectId= — what actually
// goes into this agent's system prompt on every run, and roughly what it
// costs. See `@agent-office/domain` services/agents/context-cost.ts.
import { contextCost, projects } from "@agent-office/domain/services";
import { validateIdParam, tryService } from "@/lib/api-helpers";
import { validateQuery } from "@/lib/validation";
import { contextCostQuerySchema } from "@/lib/validation-schemas";

type Params = { params: Promise<{ id: string }> };

// Live data — recomputed every call from the latest finished run + on-disk
// memory files. Must never be cached at ANY layer: not Next's route cache,
// and (the one that actually bit us) not the Tauri/WebKit webview's own HTTP
// cache, which would otherwise pin a stale "no measurement yet" placeholder
// captured before the conversation's first run finished, surviving even an
// app relaunch until the cache entry aged out.
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: Request, { params }: Params) {
  const { value: agentId, error: idError } = validateIdParam((await params).id);
  if (idError) return idError;

  const { searchParams } = new URL(request.url);
  const { data, error } = validateQuery(contextCostQuerySchema, searchParams);
  if (error) return error;

  const project = data.projectId ? projects.readProject(data.projectId) : null;

  const res = await tryService(() =>
    contextCost.buildContextCostBreakdown({ agentId, instanceId: data.instanceId, project }),
  );
  res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
  return res;
}
