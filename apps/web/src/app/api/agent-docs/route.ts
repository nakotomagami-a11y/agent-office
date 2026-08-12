import { NextResponse } from "next/server";
import { docs } from "@agent-office/domain/services";

// List every agent-authored doc across every owner. Returns metadata only —
// bodies are fetched per-doc via /api/agent-docs/[owner]/[slug].
export async function GET() {
  return NextResponse.json(docs.listDocs());
}
