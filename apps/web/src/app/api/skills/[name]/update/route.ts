import { NextResponse } from "next/server";
import { skills } from "@agent-office/domain/services";
import { serverError, validateIdParam } from "@/lib/api-helpers";
import { log } from "@agent-office/domain/services/log";

type Params = { params: Promise<{ name: string }> };

export async function POST(_request: Request, { params }: Params) {
  const { value: name, error } = validateIdParam((await params).name);
  if (error) return error;
  try {
    const result = await skills.updateSkill(name);
    return NextResponse.json({ ok: true, name, ...result });
  } catch (e) {
    log.warn("skill.update_failed", { name, err: String(e) });
    return serverError("skill_update_failed");
  }
}
