import { homedir } from "node:os";
import { resolve } from "node:path";
import { NextResponse } from "next/server";
import { settings } from "@agent-office/domain/services";
import { validateQuery } from "@/lib/validation";
import { settingsScanQuerySchema } from "@/lib/validation-schemas";
import { badRequest } from "@/lib/api-helpers";

const HOME = homedir();

export async function GET(request: Request) {
  const url = new URL(request.url);
  const { data: q, error } = validateQuery(settingsScanQuerySchema, url.searchParams);
  if (error) return error;

  // Expand ~ before resolving — path.resolve treats ~ as a literal directory
  // name relative to cwd, producing a nonsense path like /cwd/~/Documents.
  const expanded = q.root ? q.root.replace(/^~(?=\/|$)/, HOME) : HOME;
  const root = resolve(expanded);
  if (root !== HOME && !root.startsWith(HOME + "/")) {
    return badRequest("root_outside_home");
  }

  const excluded = q.excluded.split(",").filter(Boolean);
  const includeExcluded = q.includeExcluded === "1";
  return NextResponse.json(settings.scanProjects(root, excluded, includeExcluded));
}
