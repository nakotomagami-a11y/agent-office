// GET/POST/DELETE /api/flutter/run — start, poll, or stop a `flutter run` process
// for a project (PID-tracked per project). Gated on the `flutter` integration.
import { NextResponse } from "next/server";
import { badRequest, requireIntegration } from "@/lib/api-helpers";
import { startRun, stopRun, getRunStatus, runTrackingKey } from "@/lib/server/flutter";

export async function POST(req: Request) {
  const gate = requireIntegration("flutter");
  if (gate) return gate;
  let body: { projectId?: string; deviceId?: string; customPath?: string } = {};
  try { body = await req.json() as typeof body; } catch { /* no body */ }

  const result = startRun(body);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ pid: result.pid, flutterCwd: result.cwd });
}

export async function DELETE(req: Request) {
  const gate = requireIntegration("flutter");
  if (gate) return gate;
  const { searchParams } = new URL(req.url);
  const key = runTrackingKey(searchParams.get("projectId"), searchParams.get("customPath"));
  if (!key) return badRequest("projectId or customPath required");

  const { wasRunning, pid } = stopRun(key);
  return NextResponse.json({ ok: true, wasRunning, ...(pid ? { pid } : {}) });
}

export async function GET(req: Request) {
  const gate = requireIntegration("flutter");
  if (gate) return gate;
  const { searchParams } = new URL(req.url);
  const key = runTrackingKey(searchParams.get("projectId"), searchParams.get("customPath"));
  if (!key) return badRequest("projectId or customPath required");

  return NextResponse.json(getRunStatus(key));
}
