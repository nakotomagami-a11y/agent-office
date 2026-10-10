// GET /api/skills/registry — the remote skills registry (cached).
import { skills } from "@agent-office/domain/services";
import { log } from "@agent-office/domain/services/infra/log";
import { serverError } from "../../../lib/api-helpers";
import { validateQuery } from "../../../lib/validation";
import { skillsRegistryQuerySchema } from "@agent-office/api-contract";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const { data: q, error } = validateQuery(skillsRegistryQuerySchema, url.searchParams);
  if (error) return error;
  try {
    const entries = await skills.fetchRegistry(q.refresh);
    return Response.json(entries);
  } catch (e) {
    log.warn("skills.registry_failed", { err: String(e) });
    return serverError("skill_registry_failed");
  }
}
