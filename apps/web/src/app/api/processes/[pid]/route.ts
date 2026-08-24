// GET/DELETE /api/processes/<pid> — inspect or kill one tracked process.
import { NextResponse } from "next/server";
import { processes } from "@agent-office/domain/services";
import { deleteProcess } from "@/lib/server-process-store";
import { badRequest } from "@/lib/api-helpers";

type Params = { params: Promise<{ pid: string }> };

export async function GET(_request: Request, { params }: Params) {
  const pid = processes.parsePid((await params).pid);
  if (pid === null) return badRequest();
  return NextResponse.json({ alive: processes.isProcessAlive(pid) });
}

export async function DELETE(_request: Request, { params }: Params) {
  const pid = processes.parsePid((await params).pid);
  if (pid === null) return badRequest();

  const result = processes.killProcess(pid);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });

  deleteProcess(pid);
  return NextResponse.json({ ok: true });
}
