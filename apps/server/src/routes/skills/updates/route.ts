// GET /api/skills/updates — check installed skills for available updates.
import { skills } from "@agent-office/domain/services";
import { log } from "@agent-office/domain/services/infra/log";
import { serverError } from "../../../lib/api-helpers";

export async function GET() {
  try {
    return Response.json(await skills.checkForUpdates());
  } catch (e) {
    log.warn("skills.updates_failed", { err: String(e) });
    return serverError("skill_updates_failed");
  }
}
