import { NextResponse } from "next/server";
import { store, runs as runsService } from "@agent-office/domain/services";
import { validateQuery } from "@/lib/validation";
import { runsQuerySchema } from "@/lib/validation-schemas";
import { z } from "zod";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const { data: q, error } = validateQuery(runsQuerySchema, url.searchParams);
  if (error) return error;
  const limit = Math.min(q.limit ?? 50, 500);

  // Snapshot both sources synchronously before any filtering to minimise the
  // window in which a run can transition from live→persisted and appear in both
  // lists. better-sqlite3 is synchronous so both calls execute without yielding.
  const liveRunning = runsService.getRunningRuns();
  const liveIds = new Set(liveRunning.map((r) => r.id));
  const persisted = store.getRuns({ agentId: q.agent, projectId: q.project, instanceId: q.instance, limit: Math.min(limit + liveRunning.length, 500) });
  // Persisted runs that still carry status='running' but are absent from the
  // live registry are orphans (crash, test seed, etc.) *only* if the process
  // that spawned them is gone. One owned by a live sibling process (dev server
  // restart) is genuinely still running - reporting it as 'error' is what made
  // healthy agents look dead.
  const all = [
    ...liveRunning,
    ...persisted
      .filter((r) => !liveIds.has(r.id))
      .map((r) => r.status === "running" && store.isRunOrphaned(r.id)
        ? { ...r, status: "error" as const, exitCode: r.exitCode ?? -1 }
        : r),
  ];

  // Live runs are not pre-filtered by the DB query so apply the same filters.
  const filtered = all.filter((r) => {
    if (q.agent && r.agentId !== q.agent) return false;
    if (q.project && r.projectId !== q.project) return false;
    if (q.instance && r.instanceId !== q.instance) return false;
    return true;
  });
  return NextResponse.json(filtered.slice(0, limit));
}

const deleteSchema = z.object({ agent: z.string().min(1) });

export async function DELETE(request: Request) {
  const url = new URL(request.url);
  const parse = deleteSchema.safeParse({ agent: url.searchParams.get("agent") });
  if (!parse.success) {
    return NextResponse.json({ error: "agent param required" }, { status: 400 });
  }
  const deleted = store.deleteRunsByAgent(parse.data.agent);
  return NextResponse.json({ deleted });
}
