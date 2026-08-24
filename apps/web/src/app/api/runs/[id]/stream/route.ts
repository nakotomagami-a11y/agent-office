// GET /api/runs/<id>/stream — SSE stream of a run's live output (chunk/tool/usage/done).
import { runs } from "@agent-office/domain/services";
import { createSseStream, SSE_HEADERS } from "@/lib/sse";
import { validateIdParam } from "@/lib/api-helpers";

type Params = { params: Promise<{ id: string }> };

export const dynamic = "force-dynamic";

const HEARTBEAT_MS = 25_000;

export async function GET(request: Request, { params }: Params) {
  const { id: rawId } = await params;
  const idCheck = validateIdParam(rawId);
  if (idCheck.error) return idCheck.error;
  const id = idCheck.value;

  const { stream, writer } = createSseStream();
  const emit: runs.SseEmit = (event) => writer.write(event.name, event.data);
  const attached = runs.attachEmit(id, emit);

  if (!attached) {
    // Not live: replay the correct terminal outcome from persisted state.
    for (const event of runs.resolveDetachedRunEvents(id)) {
      await writer.write(event.name, event.data);
    }
    await writer.close();
    return new Response(stream, { headers: SSE_HEADERS });
  }

  const heartbeat = setInterval(() => {
    if (writer.closed) return;
    void writer.writeRaw(": keepalive\n\n");
  }, HEARTBEAT_MS);
  if (typeof heartbeat.unref === "function") heartbeat.unref();

  request.signal.addEventListener("abort", () => {
    clearInterval(heartbeat);
    runs.detachEmit(id, emit);
    void writer.close();
  });

  return new Response(stream, { headers: SSE_HEADERS });
}
