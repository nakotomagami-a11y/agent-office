import { NextResponse } from "next/server";
import { skills } from "@agent-office/domain/services";
import type { SkillIconClass } from "@agent-office/domain/services/skills";
import { log } from "@agent-office/domain/services/log";
import { badRequest, serverError } from "@/lib/api-helpers";

const CLASSES: SkillIconClass[] = ["any", "anyweapon", "blades", "spears", "axes", "staffs", "tridents"];

export async function GET() {
  try {
    return NextResponse.json(skills.getSkillIcons());
  } catch (e) {
    log.warn("skills.icons_failed", { err: String(e) });
    return serverError("skill_icons_failed");
  }
}

export async function POST(request: Request) {
  const raw = (await request
    .json()
    .catch(() => null)) as { key?: unknown; seed?: unknown; iconClass?: unknown } | null;
  if (!raw || typeof raw.key !== "string" || !raw.key) return badRequest("key required");
  const iconClass = CLASSES.includes(raw.iconClass as SkillIconClass)
    ? (raw.iconClass as SkillIconClass)
    : "any";
  try {
    // Explicit seed → persist that exact config; otherwise reroll a random one.
    const config =
      typeof raw.seed === "string" && raw.seed
        ? skills.setSkillIcon(raw.key, { seed: raw.seed, iconClass })
        : skills.rerollSkillIcon(raw.key, iconClass);
    return NextResponse.json({ ok: true, key: raw.key, config });
  } catch (e) {
    return serverError(String(e instanceof Error ? e.message : e));
  }
}
