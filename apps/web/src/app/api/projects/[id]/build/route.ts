// GET /api/projects/<id>/build — report whether a build command is detectable.
// POST — detect it (.ao.json override, else a package.json build script) and run it
// in a spawned OS terminal window; returns the child pid.
import { existsSync } from "node:fs";
import { isAbsolute } from "node:path";
import { NextResponse } from "next/server";
import { projects } from "@agent-office/domain/services";
import { validateIdParam, notFound, badRequest } from "@/lib/api-helpers";
import { detectPackageManager, detectBuildCommand } from "@/lib/server/project-runtime";
import { spawnInTerminal } from "@/lib/server/terminal";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Params) {
  const { value: id, error } = validateIdParam((await params).id);
  if (error) return error;

  const project = projects.readProject(id);
  if (!project) return notFound();

  const cwd = project.meta.cwd;
  if (!cwd || !isAbsolute(cwd) || !existsSync(cwd)) return NextResponse.json({ hasBuild: false });

  return NextResponse.json({ hasBuild: !!detectBuildCommand(cwd, detectPackageManager(cwd)) });
}

export async function POST(_req: Request, { params }: Params) {
  const { value: id, error } = validateIdParam((await params).id);
  if (error) return error;

  const project = projects.readProject(id);
  if (!project) return notFound();

  const cwd = project.meta.cwd;
  if (!cwd || !isAbsolute(cwd) || !existsSync(cwd)) return badRequest("working_directory_not_found");

  const argv = detectBuildCommand(cwd, detectPackageManager(cwd));
  if (!argv) return badRequest("no_build_command");

  const child = spawnInTerminal("Build", cwd, argv);
  return NextResponse.json({ pid: child.pid ?? null });
}
