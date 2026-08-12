import { NextResponse } from "next/server";
import { rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { projects } from "@agent-office/domain/services";
import { validateIdParam, notFound } from "@/lib/api-helpers";

type Params = { params: Promise<{ id: string }> };

const CACHE_DIRS = [".next", ".turbo", "node_modules/.cache"];

export async function POST(_req: Request, { params }: Params) {
  const { id } = await params;
  const { value, error } = validateIdParam(id);
  if (error) return error;

  const project = projects.readProject(value);
  if (!project) return notFound("Project");

  const cwd = project.meta.cwd;
  if (!cwd) return NextResponse.json({ error: "No cwd" }, { status: 400 });

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
