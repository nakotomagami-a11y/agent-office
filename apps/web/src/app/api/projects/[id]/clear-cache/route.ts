// POST /api/projects/<id>/clear-cache — delete the project's cached/derived
// build artifacts from disk (see CACHE_DIRS).
import { NextResponse } from "next/server";
import { rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { projects } from "@agent-office/domain/services";
import { badRequest, notFound, validateIdParam } from "@/lib/api-helpers";
import { CACHE_DIRS } from "@/lib/server/project-runtime";

type Params = { params: Promise<{ id: string }> };

export async function POST(_req: Request, { params }: Params) {
  const { value, error } = validateIdParam((await params).id);
  if (error) return error;

  const project = projects.readProject(value);
  if (!project) return notFound();

  const cwd = project.meta.cwd;
  if (!cwd) return badRequest("no_cwd");

  const removed: string[] = [];
  for (const dir of CACHE_DIRS) {
    const full = join(cwd, dir);
    if (existsSync(full)) {
      rmSync(full, { recursive: true, force: true });
      removed.push(dir);
    }
  }

  return NextResponse.json({ ok: true, removed });
}
