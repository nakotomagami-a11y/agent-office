// GET/PUT /api/memory/global — read or replace the global memory injected into every agent.
import { agents } from "@agent-office/domain/services";
import { MAX_MEMORY_BYTES } from "@agent-office/domain/services/infra/paths";
import { readBoundedText } from "@/lib/api-helpers";

export async function GET() {
  return new Response(agents.readGlobalMemory(), {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}

export async function PUT(request: Request) {
  const { text, error } = await readBoundedText(request, MAX_MEMORY_BYTES);
  if (error) return error;
  agents.writeGlobalMemory(text);
  return new Response("ok", { headers: { "Content-Type": "text/plain; charset=utf-8" } });
}
