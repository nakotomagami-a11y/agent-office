// POST /api/skills/create — scaffold a new local skill.
import { NextResponse } from "next/server";
import { skills } from "@agent-office/domain/services";
import { log } from "@agent-office/domain/services/infra/log";
import { badRequest, serverError } from "@/lib/api-helpers";
import { validateBody } from "@/lib/validation";
import { skillCreateSchema } from "@/lib/validation-schemas";

export async function POST(request: Request) {
  const raw: unknown = await request.json();
  const { data, error } = validateBody(skillCreateSchema, raw);
  if (error) return error;
  try {
    const skill = skills.writeLocalSkill(
      { name: data.name, description: data.description, tags: data.tags, body: data.body },
      { overwrite: data.overwrite ?? false },
    );
    return NextResponse.json({ ok: true, skill });
  } catch (e) {
    if (e instanceof skills.SkillExistsError) return badRequest("skill_exists");
    log.warn("skills.create_failed", { name: data.name, err: String(e) });
    return serverError("skill_create_failed");
  }
}
