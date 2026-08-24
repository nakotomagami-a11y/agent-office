// GET /api/agents/<id>/body/history — list the agent's body-backup snapshots
// (filename, parsed timestamp, size), newest-first.
import { NextResponse } from "next/server";
import { agents } from "@agent-office/domain/services";
import { validateIdParam } from "@/lib/api-helpers";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  const { value: id, error } = validateIdParam((await params).id);
  if (error) return error;
  return NextResponse.json(agents.listAgentBodyHistory(id));
}
