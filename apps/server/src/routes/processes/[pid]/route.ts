// GET/DELETE /api/processes/<pid> — inspect or kill one tracked process.
import { processes } from "@agent-office/domain/services";
import { deleteProcess } from "../../../lib/server-process-store";
import { badRequest } from "../../../lib/api-helpers";

type Params = { params: Promise<{ pid: string }> };

export async function GET(_request: Request, { params }: Params) {
  const pid = processes.parsePid((await params).pid);
  if (pid === null) return badRequest();
  return Response.json({ alive: processes.isProcessAlive(pid) });
}

export async function DELETE(_request: Request, { params }: Params) {
  const pid = processes.parsePid((await params).pid);
  if (pid === null) return badRequest();

  const result = processes.killProcess(pid);
  if (!result.ok) return Response.json({ error: result.error }, { status: result.status });

  deleteProcess(pid);
  return Response.json({ ok: true });
}
