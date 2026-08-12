import { runs, store } from "@agent-office/domain/services";
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
    // Run not in live registry - check DB so we can give the correct exit status.
    const persisted = store.getRun(id);
    if (persisted) {
      // "running" here means another process owns it. Only declare it dead if
      // that process is actually gone - otherwise the run is alive and simply
      // unreachable from this worker, and killing it would turn a healthy
      // agent into a phantom failure.
      const stillRunning = persisted.status === "running";
      const orphaned = stillRunning && store.isRunOrphaned(id);
      if (orphaned) store.markRunAborted(id);

      if (stillRunning && !orphaned) {
        await writer.write("error", {
          runId: id,
          message: "This run is owned by another server process (the dev server restarted mid-run). It is still working - its result will appear in history when it finishes.",
        });
        await writer.write("done", { runId: id, exitCode: 1, sessionId: persisted.sessionId });
      } else {
        // markRunAborted moved the row to error/-1; `persisted` is the stale
        // pre-update snapshot, so derive the outcome from `orphaned` too.
        // Without this an orphan reported exitCode 0 and no message at all -
        // the UI just stopped mid-task with no explanation.
        const exitCode = orphaned ? -1 : persisted.exitCode ?? null;
        const failed = orphaned || persisted.status === "error" || (exitCode != null && exitCode !== 0);
        if (failed) {
          const message = exitCode === -1
            ? "Run was interrupted - the server restarted while this run was in progress"
            : "Run ended with an error";
          await writer.write("error", { runId: id, message });
        }
        await writer.write("done", { runId: id, exitCode: exitCode ?? (failed ? 1 : 0), sessionId: persisted.sessionId });
      }
    } else {
      await writer.write("error", { runId: id, message: `unknown run: ${id}` });
      await writer.write("done", { runId: id, exitCode: 1 });
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
