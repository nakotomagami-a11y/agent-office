import { agents } from "@agent-office/domain/services";
import { MAX_MEMORY_BYTES } from "@agent-office/domain/services/paths";
import { readBoundedText, validateIdParam } from "@/lib/api-helpers";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  const { value: id, error } = validateIdParam((await params).id);
  if (error) return error;
  const text = agents.readAgentMemory(id);
  return new Response(text, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
}

export async function PUT(request: Request, { params }: Params) {
  const { value: id, error: paramError } = validateIdParam((await params).id);
  if (paramError) return paramError;
  const { text, error } = await readBoundedText(request, MAX_MEMORY_BYTES);
  if (error) return error;
  agents.writeAgentMemory(id, text);
  return new Response("ok", { headers: { "Content-Type": "text/plain; charset=utf-8" } });
}
