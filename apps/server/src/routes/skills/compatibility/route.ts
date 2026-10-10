// GET /api/skills/compatibility — the installed-skills compatibility map.
import { skills } from "@agent-office/domain/services";
import { log } from "@agent-office/domain/services/infra/log";
import { serverError } from "../../../lib/api-helpers";

export async function GET() {
  try {
    const compat = skills.readCompatibility();
    if (!compat) {
      return Response.json({}, { status: 200 });
    }
    return Response.json(compat);
  } catch (e) {
    log.warn("skills.compatibility_failed", { err: String(e) });
    return serverError("skill_compatibility_failed");
  }
}
