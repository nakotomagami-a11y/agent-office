import { NextResponse } from "next/server";
import { runs as runsService } from "@agent-office/domain/services";

export async function POST(req: Request) {
  let body: { projectId?: string } = {};
  try { body = await req.json() as typeof body; } catch { /* no body */ }

  const running = runsService.getRunningRuns();
  const toAbort = body.projectId
    ? running.filter((r) => r.projectId === body.projectId)
    : running;

  for (const run of toAbort) {
    runsService.abortRun(run.id);
  }

  return NextResponse.json({ aborted: toAbort.length });
}
