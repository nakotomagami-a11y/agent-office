// POST /api/skills/import — import a skill from a local path or archive.
import { skills } from "@agent-office/domain/services";
import { log } from "@agent-office/domain/services/infra/log";
import { badRequest } from "../../../lib/api-helpers";
import { validateBody } from "../../../lib/validation";
import { skillImportSchema } from "@agent-office/api-contract";

export async function POST(request: Request) {
  const raw: unknown = await request.json();
  const { data, error } = validateBody(skillImportSchema, raw);
  if (error) return error;
  try {
    const skill = skills.importPastedSkill(data.content);
    return Response.json({ ok: true, skill });
  } catch (e) {
    if (e instanceof skills.SkillExistsError) return badRequest("skill_exists");
    const msg = e instanceof Error ? e.message : String(e);
    log.warn("skills.import_failed", { err: msg });
    return badRequest(msg.startsWith("invalid skill name") ? "invalid_skill_name" : "skill_import_invalid");
  }
}
