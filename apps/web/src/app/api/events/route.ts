// GET /api/events — one app-wide SSE stream of coarse domain events
// (runs:changed, spend:changed, conversations:changed, schedules:changed). The
// browser opens exactly one of these and maps each event to a React Query
// invalidation, replacing the per-hook `refetchInterval` timers for
// server-driven state. External-world watchers (login/device/process polling)
// keep their own short polls — see services/infra/events.ts.
import { events } from "@agent-office/domain/services";
import { createSseStream, SSE_HEADERS } from "@/lib/sse";

export const dynamic = "force-dynamic";

const HEARTBEAT_MS = 25_000;

export async function GET(request: Request) {
  const { stream, writer } = createSseStream();

  const unsubscribe = events.onAppEvent((type) => {
    void writer.write(type, { at: Date.now() });
  });

  const heartbeat = setInterval(() => {
    if (writer.closed) return;
    void writer.writeRaw(": keepalive\n\n");
  }, HEARTBEAT_MS);
  if (typeof heartbeat.unref === "function") heartbeat.unref();

  request.signal.addEventListener("abort", () => {
    clearInterval(heartbeat);
    unsubscribe();
    void writer.close();
  });

  return new Response(stream, { headers: SSE_HEADERS });
}
