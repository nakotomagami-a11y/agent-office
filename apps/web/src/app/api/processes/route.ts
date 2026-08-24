// GET /api/processes — list tracked dev/build server child processes, matched to
// projects by cwd. Linux-only (returns [] elsewhere).
import { NextResponse } from "next/server";
import { processes } from "@agent-office/domain/services";

export function GET() {
  return NextResponse.json(processes.listProcesses());
}
