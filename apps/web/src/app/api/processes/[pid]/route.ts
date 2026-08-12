import { readFileSync, existsSync } from "node:fs";
import { NextResponse } from "next/server";
import { deleteProcess } from "@/lib/server-process-store";

type Params = { params: Promise<{ pid: string }> };

function readProcUid(pid: number): number | null {
  try {
    const status = readFileSync(`/proc/${pid}/status`, "utf8");
    const match = /^Uid:\s+(\d+)/m.exec(status);
    if (!match) return null;
    return parseInt(match[1]!, 10);
  } catch {
    return null;
  }
}

export async function GET(_request: Request, { params }: Params): Promise<NextResponse> {
  const rawPid = (await params).pid;
  const pid = parseInt(rawPid, 10);
  if (!Number.isInteger(pid) || pid <= 0 || String(pid) !== rawPid) {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  return NextResponse.json({ alive: existsSync(`/proc/${pid}/status`) });
}

export async function DELETE(_request: Request, { params }: Params): Promise<NextResponse> {
  const rawPid = (await params).pid;
  const pid = parseInt(rawPid, 10);

  if (!Number.isInteger(pid) || pid <= 0 || String(pid) !== rawPid) {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  const currentUid = typeof process.getuid === "function" ? process.getuid() : null;

  if (currentUid !== null) {
    const uid = readProcUid(pid);
    if (uid === null) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    if (uid !== currentUid) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
  }

  try {
    // SIGKILL: cannot be caught or ignored - the process dies immediately.
    // Using SIGTERM here left processes alive when they ignored the signal.
    process.kill(pid, "SIGKILL");
    deleteProcess(pid);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const err = e as NodeJS.ErrnoException;
    if (err.code === "ESRCH") {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
