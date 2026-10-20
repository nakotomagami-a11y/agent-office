// GET /api/settings/scan — scan the projects root for candidate project folders.
import { resolve } from "node:path";
import { settings } from "@agent-office/domain/services";
import { expandTilde, HOME, isInside, samePath } from "@agent-office/domain/services/infra/paths";
import { validateQuery } from "../../../lib/validation";
import { settingsScanQuerySchema } from "@agent-office/api-contract";
import { badRequest } from "../../../lib/api-helpers";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const { data: q, error } = validateQuery(settingsScanQuerySchema, url.searchParams);
  if (error) return error;

  // Expand ~ before resolving — path.resolve treats ~ as a literal directory
  // name relative to cwd, producing a nonsense path like /cwd/~/Documents.
  const root = resolve(q.root ? expandTilde(q.root) : HOME);
  if (!samePath(root, HOME) && !isInside(root, HOME)) {
    return badRequest("root_outside_home");
  }

  const excluded = q.excluded.split(",").filter(Boolean);
  const includeExcluded = q.includeExcluded === "1";
  return Response.json(settings.scanProjects(root, excluded, includeExcluded));
}
