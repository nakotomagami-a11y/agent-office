// GET /api/agents/<id>/prompt-preview?instanceId=&projectId= — the EXACT text
// this agent receives as its appended system prompt, plus the per-segment
// breakdown it was assembled from.
//
// `context-cost` reports how *big* each segment is; this reports what each one
// actually *says*. Until this existed there was no way to see what an agent had
// been told, which is how a broken sqlite command and 47 unresolvable skill
// references shipped unnoticed.
import { NextResponse } from "next/server";
import { agents, projects } from "@agent-office/domain/services";
import { validateIdParam, notFound } from "@/lib/api-helpers";
import { validateQuery } from "@/lib/validation";
import { contextCostQuerySchema } from "@/lib/validation-schemas";

type Params = { params: Promise<{ id: string }> };

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: Request, { params }: Params) {
  const { value: agentId, error: idError } = validateIdParam((await params).id);
  if (idError) return idError;

  const { searchParams } = new URL(request.url);
  const { data, error } = validateQuery(contextCostQuerySchema, searchParams);
  if (error) return error;

  // A preview of a nonexistent agent would render a plausible payload from
  // global/identity memory alone — the same silent-typo failure this tool
  // exists to expose.
  if (!agents.readAgent(agentId)) return notFound("agent");

  const project = data.projectId ? projects.readProject(data.projectId) : null;
  const segments = agents.composeAppendedPrompt(agentId, project, { instanceId: data.instanceId });
  // MUST match `buildAppendedPrompt` exactly — same segments, same join, no
  // filtering. A preview that is tidier than the real prompt is a lie, and a
  // lying mirror is worse than none.
  const text = agents.buildAppendedPrompt(agentId, project, data.instanceId);

  const res = NextResponse.json({
    agentId,
    instanceId: data.instanceId ?? "default",
    projectId: data.projectId ?? null,
    chars: text.length,
    text,
    segments: segments.map((s) => ({
      key: s.key,
      name: s.name,
      sub: s.sub,
      phase: s.phase,
      locked: s.locked,
      chars: s.text.length,
      children: s.children ?? [],
    })),
  });
  res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
  return res;
}
