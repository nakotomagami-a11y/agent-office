// GET/POST /api/skills/icons — read the resolved skill-icon map, or set a skill's icon.
import { NextResponse } from "next/server";
import { skills } from "@agent-office/domain/services";
import { isSkillIconClass } from "@agent-office/domain/config/skill-icons";
import { log } from "@agent-office/domain/services/infra/log";
import { validateBody } from "@/lib/validation";
import { skillIconSetSchema } from "@/lib/validation-schemas";
import { badRequest, serverError } from "@/lib/api-helpers";

export async function GET() {
  try {
    return NextResponse.json(skills.getSkillIcons());
  } catch (e) {
    log.warn("skills.icons_failed", { err: String(e) });
    return serverError("skill_icons_failed");
  }
}

export async function POST(request: Request) {
  const raw: unknown = await request.json().catch(() => null);
  const { data, error } = validateBody(skillIconSetSchema, raw);
  if (error) return badRequest("key_required");
  const iconClass = isSkillIconClass(data.iconClass) ? data.iconClass : "any";
  try {
    // Explicit seed → persist that exact config; otherwise reroll a random one.
    const config =
      data.seed
        ? skills.setSkillIcon(data.key, { seed: data.seed, iconClass })
        : skills.rerollSkillIcon(data.key, iconClass);
    return NextResponse.json({ ok: true, key: data.key, config });
  } catch (e) {
    return serverError(String(e instanceof Error ? e.message : e));
  }
}
