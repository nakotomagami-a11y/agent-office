import { NextResponse } from "next/server";
import { skills } from "@agent-office/domain/services";
import { badRequest, notFound, validateIdParam } from "@/lib/api-helpers";

type Params = { params: Promise<{ name: string }> };

// Section-level customization for an installed skill (Phase 1). Global: the
// disabled set applies wherever the skill is used. GET returns the skill's
// `##` sections + which are currently off; PUT replaces the disabled set.
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
  const { value: name, error } = validateIdParam((await params).name);
  if (error) return error;
  const skill = skills.readInstalledSkill(name);
  if (!skill) return notFound();
  const raw = (await request.json().catch(() => null)) as { disabledSections?: unknown } | null;
  if (!raw || !Array.isArray(raw.disabledSections)) {
    return badRequest("disabledSections[] required");
  }
  const disabled = raw.disabledSections.filter((s): s is string => typeof s === "string");
  const cfg = skills.setSkillCustomization(name, {
    ...skills.getSkillCustomization(name),
    disabledSections: disabled,
  });
  return NextResponse.json({ ok: true, disabledSections: cfg.disabledSections ?? [] });
}
