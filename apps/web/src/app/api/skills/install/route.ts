import { NextResponse } from "next/server";
import { skills } from "@agent-office/domain/services";
import { log } from "@agent-office/domain/services/log";
import { serverError } from "@/lib/api-helpers";
import { validateBody } from "@/lib/validation";
import { skillInstallSchema } from "@/lib/validation-schemas";

export async function POST(request: Request) {
  const raw: unknown = await request.json();
  const { data, error } = validateBody(skillInstallSchema, raw);
  if (error) return error;
  try {
    await skills.installSkill(data.source, data.ref, data.path, data.name);
    return NextResponse.json({ ok: true, name: data.name });
  } catch (e) {
    log.warn("skills.install_failed", { name: data.name, err: String(e) });
    return serverError("skill_install_failed");
  }
}
