// GET /api/agent-docs — list every agent-authored doc across all owners (metadata
// only; bodies are fetched per-doc via /api/agent-docs/<owner>/<slug>).
import { NextResponse } from "next/server";
import { docs } from "@agent-office/domain/services";

export async function GET() {
  return NextResponse.json(docs.listDocs());
}
