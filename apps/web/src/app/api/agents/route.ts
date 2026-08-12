import { NextResponse } from "next/server";
import { agents } from "@agent-office/domain/services";
import { validateBody } from "@/lib/validation";
import { agentBodySchema } from "@/lib/validation-schemas";
import { tryService } from "@/lib/api-helpers";

export async function GET() {
  return NextResponse.json(agents.listAgents());
}

export async function POST(request: Request) {
  const raw: unknown = await request.json();
  const { data: body, error } = validateBody(agentBodySchema, raw);
  if (error) return error;
  return tryService(() => ({ id: agents.writeAgent(body) }));
}
