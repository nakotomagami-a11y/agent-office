import { NextResponse } from "next/server";
import { db } from "@agent-office/domain/services";
import { badRequest, validateIdParam, readBoundedText } from "@/lib/api-helpers";

const DRAFT_MAX_BYTES = 512 * 1024; // 512 KB

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const rawAgentId = searchParams.get("agentId");
  if (!rawAgentId) return badRequest("missing agentId");
  const { value: agentId, error: agentIdErr } = validateIdParam(rawAgentId);
  if (agentIdErr) return agentIdErr;

  const rawInstanceId = searchParams.get("instanceId") ?? "default";
  const instanceId = rawInstanceId || "default";
  const text = db.getDraft(agentId, instanceId);
  return NextResponse.json({ text });
}

export async function PUT(request: Request) {
  const { searchParams } = new URL(request.url);
  const rawAgentId = searchParams.get("agentId");
  if (!rawAgentId) return badRequest("missing agentId");
  const { value: agentId, error: agentIdErr } = validateIdParam(rawAgentId);
  if (agentIdErr) return agentIdErr;

  const rawInstanceId = searchParams.get("instanceId") ?? "default";
  const instanceId = rawInstanceId || "default";

  const { text, error: bodyErr } = await readBoundedText(request, DRAFT_MAX_BYTES);
  if (bodyErr) return bodyErr;

  let body: { text: string };
  try { body = JSON.parse(text) as { text: string }; } catch {
    return badRequest("invalid_json");
  }
  db.saveDraft(agentId, instanceId, body.text ?? "");
  return NextResponse.json({ ok: true });
}
