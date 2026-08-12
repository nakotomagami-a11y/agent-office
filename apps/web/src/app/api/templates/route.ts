import { NextResponse } from "next/server";
import { templates } from "@agent-office/domain/services";

export async function GET() {
  return NextResponse.json(templates.AGENT_TEMPLATES);
}
