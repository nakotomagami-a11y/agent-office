import { NextResponse } from "next/server";
import { skills } from "@agent-office/domain/services";
import { log } from "@agent-office/domain/services/log";
import { badRequest, serverError } from "@/lib/api-helpers";

export async function GET() {
  try {
    return NextResponse.json(skills.registrySources());
  } catch (e) {
    log.warn("skills.sources_failed", { err: String(e) });
    return serverError("skill_sources_failed");
  }
}

export async function POST(request: Request) {
  const raw = (await request.json().catch(() => null)) as { input?: unknown } | null;
  if (!raw || typeof raw.input !== "string") return badRequest("input required");
  try {
    const added = skills.addUserSource(raw.input);
    return NextResponse.json({ ok: true, source: added });
  } catch (e) {
    return badRequest(String(e instanceof Error ? e.message : e));
  }
}

export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const source = searchParams.get("source");
  const ref = searchParams.get("ref") ?? "main";
  if (!source) return badRequest("source query param required");
  try {
    const removed = skills.removeUserSource(source, ref);
    return NextResponse.json({ removed });
  } catch (e) {
    return badRequest(String(e instanceof Error ? e.message : e));
  }
}
