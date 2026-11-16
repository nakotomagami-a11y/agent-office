// GET /api/settings/scan — scan the projects root for candidate project folders.
import { resolve } from "node:path";
import { settings } from "@agent-office/domain/services";
import { expandTilde, HOME } from "@agent-office/domain/services/infra/paths";
import { validateQuery } from "../../../lib/validation";
import { settingsScanQuerySchema } from "@agent-office/api-contract";
import { badRequest } from "../../../lib/api-helpers";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const { data: q, error } = validateQuery(settingsScanQuerySchema, url.searchParams);
  if (error) return error;

  // Checked as typed (resolving first would anchor a relative root at the cwd); ~ is expanded before resolve.
  const input = q.root?.trim() || HOME;
  const problem = settings.projectsRootProblem(input);
  if (problem) return badRequest(problem);
  const root = resolve(expandTilde(input));

  const excluded = q.excluded.split(",").filter(Boolean);
  const includeExcluded = q.includeExcluded === "1";
  return Response.json(settings.scanProjects(root, excluded, includeExcluded));
}
