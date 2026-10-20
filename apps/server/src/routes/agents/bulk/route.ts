// POST /api/agents/bulk — create many agents in one call; a taken id is an `agent_exists` item error. Per-item
// failures are collected: 200 all-ok, 207 partial; all failed is the items' shared status, else 400.
import { agents } from "@agent-office/domain/services";
import { validateBody } from "../../../lib/validation";
import { agentBodyListSchema } from "@agent-office/api-contract";

export async function POST(request: Request) {
  const raw: unknown = await request.json();
  const { data: items, error } = validateBody(agentBodyListSchema, raw);
  if (error) return error;
  const written: string[] = [];
  const errors: Array<{ id: string; error: string }> = [];
  const statuses = new Set<number>();
  for (const item of items) {
    const result = agents.createAgent(item);
    if (result.ok) {
      written.push(result.value);
    } else {
      errors.push({ id: item.id, error: result.error });
      statuses.add(result.status);
    }
  }
  const status = written.length === 0 && errors.length > 0 ? (statuses.size === 1 ? [...statuses][0]! : 400)
               : errors.length > 0 ? 207
               : 200;
  return Response.json({ written, errors }, { status });
}
