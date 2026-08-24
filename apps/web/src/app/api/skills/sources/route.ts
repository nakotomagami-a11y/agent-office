// GET/POST/DELETE /api/skills/sources — manage the configured skill registry sources.
import { NextResponse } from "next/server";
import { skills } from "@agent-office/domain/services";
import { log } from "@agent-office/domain/services/infra/log";
import { validateBody } from "@/lib/validation";
import { skillSourceAddSchema } from "@/lib/validation-schemas";
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
  const raw: unknown = await request.json().catch(() => null);
  const { data, error } = validateBody(skillSourceAddSchema, raw);
  if (error) return badRequest("input required");
  try {
    const added = skills.addUserSource(data.input);
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
