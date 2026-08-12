import { NextResponse } from "next/server";
import { writeStdin } from "@/lib/server-process-store";
import { badRequest, notFound } from "@/lib/api-helpers";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ pid: string }> },
) {
  const { pid: pidStr } = await params;
  const pid = parseInt(pidStr, 10);
  if (isNaN(pid)) return badRequest("invalid pid");

  let body: { data?: string } = {};
  try { body = await req.json() as typeof body; } catch { /* empty */ }

  const data = body.data;
  if (typeof data !== "string" || data.length === 0) return badRequest("data required");

  const ok = writeStdin(pid, data);
  if (!ok) return notFound("process not found or stdin unavailable");

  return NextResponse.json({ ok: true });
}
