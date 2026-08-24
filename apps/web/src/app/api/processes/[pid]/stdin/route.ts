// POST /api/processes/<pid>/stdin — write input to a tracked process's stdin.
import { NextResponse } from "next/server";
import { writeStdin } from "@/lib/server-process-store";
import { badRequest, notFound } from "@/lib/api-helpers";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ pid: string }> },
) {
  const { pid: pidStr } = await params;
  const pid = parseInt(pidStr, 10);
  if (isNaN(pid)) return badRequest("invalid_pid");

  let body: { data?: string } = {};
  try { body = await req.json() as typeof body; } catch { /* empty */ }

  const data = body.data;
  if (typeof data !== "string" || data.length === 0) return badRequest("data_required");

  const ok = writeStdin(pid, data);
  if (!ok) return notFound("stdin_unavailable");

  return NextResponse.json({ ok: true });
}
