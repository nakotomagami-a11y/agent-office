// GET/DELETE /api/processes/<pid> — inspect or kill one tracked process.
import { processes } from "@agent-office/domain/services";
import { deleteProcess } from "../../../lib/server-process-store";
import { isLaunchedShell, forgetLaunchedShell, hasShellCommandExited } from "../../../lib/terminal";
import { badRequest } from "../../../lib/api-helpers";

type Params = { params: Promise<{ pid: string }> };

export async function GET(_request: Request, { params }: Params) {
  const pid = processes.parsePid((await params).pid);
  if (pid === null) return badRequest();
  const alive = processes.isProcessAlive(pid);
  if (!alive) forgetLaunchedShell(pid);
  return Response.json({ alive: alive && !hasShellCommandExited(pid) });
}

export async function DELETE(_request: Request, { params }: Params) {
  const pid = processes.parsePid((await params).pid);
  if (pid === null) return badRequest();

  const result = processes.killProcess(pid, { tree: isLaunchedShell(pid) && !hasShellCommandExited(pid) });
  if (!result.ok) return Response.json({ error: result.error }, { status: result.status });

  forgetLaunchedShell(pid);
  deleteProcess(pid);
  return Response.json({ ok: true });
}
