import { NextResponse } from "next/server";
import { skills } from "@agent-office/domain/services";
import { badRequest } from "@/lib/api-helpers";
import { validateBody } from "@/lib/validation";
import { skillImportSchema } from "@/lib/validation-schemas";

export async function POST(request: Request) {
  const raw: unknown = await request.json();
  const { data, error } = validateBody(skillImportSchema, raw);
  if (error) return error;
  try {
    const skill = skills.importPastedSkill(data.content);
    return NextResponse.json({ ok: true, skill });
  } catch (e) {
    if (e instanceof skills.SkillExistsError) return badRequest("skill_exists");
    return badRequest(String(e instanceof Error ? e.message : e));
  }
}
