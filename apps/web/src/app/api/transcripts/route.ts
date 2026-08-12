import { NextResponse } from "next/server";
import { db } from "@agent-office/domain/services";
import { badRequest, validateIdParam, readBoundedText } from "@/lib/api-helpers";

const TRANSCRIPT_MAX_BYTES = 5 * 1024 * 1024;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const rawAgentId = searchParams.get("agentId");
  if (!rawAgentId) return badRequest("missing agentId");
  const { value: agentId, error: agentIdErr } = validateIdParam(rawAgentId);
  if (agentIdErr) return agentIdErr;

  const rawInstanceId = searchParams.get("instanceId");
  if (rawInstanceId === null) {
    return NextResponse.json(db.listAgentTranscripts(agentId));
  }
  const instanceId = rawInstanceId || "default";
  if (instanceId !== "default") {
    const { error } = validateIdParam(instanceId);
    if (error) return error;
  }
  const transcript = db.getTranscript(agentId, instanceId);
  return NextResponse.json(transcript);
}

export async function PUT(request: Request) {
  const { searchParams } = new URL(request.url);
  const rawAgentId = searchParams.get("agentId");
  if (!rawAgentId) return badRequest("missing agentId");
  const { value: agentId, error: agentIdErr } = validateIdParam(rawAgentId);
  if (agentIdErr) return agentIdErr;

  const rawInstanceId = searchParams.get("instanceId") ?? "default";
  const instanceId = rawInstanceId || "default";
  if (instanceId !== "default") {
    const { error } = validateIdParam(instanceId);
    if (error) return error;
  }

  const { text, error: bodyErr } = await readBoundedText(request, TRANSCRIPT_MAX_BYTES);
  if (bodyErr) return bodyErr;

  let body: {
    items?: string;
    activeRunId?: string | null;
    sessionId?: string | null;
    queuedMessages?: string | null;
  };
  try { body = JSON.parse(text) as typeof body; } catch {
    return badRequest("invalid_json");
  }
  if (typeof body.items === "string") {
    try { JSON.parse(body.items); } catch {
      return badRequest("items_not_valid_json");
    }
  }
  const queuedMessages = typeof body.queuedMessages === "string" ? body.queuedMessages : "[]";
  try { JSON.parse(queuedMessages); } catch {
    return badRequest("queued_messages_not_valid_json");
  }
  db.saveTranscript(
    agentId,
    instanceId,
    body.items ?? "[]",
    body.activeRunId ?? null,
    body.sessionId ?? null,
    queuedMessages,
  );
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const rawAgentId = searchParams.get("agentId");
  if (!rawAgentId) return badRequest("missing agentId");
  const { value: agentId, error: agentIdErr } = validateIdParam(rawAgentId);
  if (agentIdErr) return agentIdErr;

  const rawInstanceId = searchParams.get("instanceId") ?? "default";
  const instanceId = rawInstanceId || "default";
  if (instanceId !== "default") {
    const { error } = validateIdParam(instanceId);
    if (error) return error;
  }
  db.clearTranscript(agentId, instanceId);
  return NextResponse.json({ ok: true });
}
