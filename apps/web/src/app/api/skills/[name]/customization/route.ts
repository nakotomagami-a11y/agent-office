// GET/PUT /api/skills/<name>/customization — section-level customization for an
// installed skill: GET returns its `##` sections + which are disabled; PUT replaces
// the disabled set (global — applies wherever the skill is used).
import { NextResponse } from "next/server";
import { skills } from "@agent-office/domain/services";
import { validateBody } from "@/lib/validation";
import { skillCustomizationSchema } from "@/lib/validation-schemas";
import { badRequest, notFound, validateIdParam } from "@/lib/api-helpers";

type Params = { params: Promise<{ name: string }> };

export async function GET(_request: Request, { params }: Params) {
  const { value: name, error } = validateIdParam((await params).name);
  if (error) return error;
  const skill = skills.readInstalledSkill(name);
  if (!skill) return notFound();
  const cfg = skills.getSkillCustomization(name);
  return NextResponse.json({
    sections: skills.parseSkillSections(skill.body),
    disabledSections: cfg?.disabledSections ?? [],
  });
}

export async function PUT(request: Request, { params }: Params) {
  const { value: name, error: paramError } = validateIdParam((await params).name);
  if (paramError) return paramError;
  const skill = skills.readInstalledSkill(name);
  if (!skill) return notFound();
  const raw: unknown = await request.json().catch(() => null);
  const { data, error } = validateBody(skillCustomizationSchema, raw);
  if (error) return badRequest("disabled_sections_required");
  const cfg = skills.setSkillCustomization(name, {
    ...skills.getSkillCustomization(name),
    disabledSections: data.disabledSections,
  });
  return NextResponse.json({ ok: true, disabledSections: cfg.disabledSections ?? [] });
}
