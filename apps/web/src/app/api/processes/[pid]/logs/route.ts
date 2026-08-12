import { NextResponse } from "next/server";
import { getProcess } from "@/lib/server-process-store";

type Params = { params: Promise<{ pid: string }> };

export async function GET(_req: Request, { params }: Params) {
  const rawPid = (await params).pid;
  const pid = parseInt(rawPid, 10);
  if (!Number.isInteger(pid) || pid <= 0 || String(pid) !== rawPid) {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  const rec = getProcess(pid);
  if (!rec) {
    return NextResponse.json({ lines: [], exitCode: null, signal: null, found: false });
  }
  return NextResponse.json({ lines: rec.lines, exitCode: rec.exitCode, signal: rec.signal, found: true });
}
