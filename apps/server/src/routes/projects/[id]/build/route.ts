// GET /api/projects/<id>/build — report whether a build command is detectable.
// POST — detect it (.ao.json override, else a package.json build script) and run it
// in a spawned OS terminal window; returns the pid of the shell running it.
import { existsSync } from "node:fs";
import { isAbsolute } from "node:path";
import { projects } from "@agent-office/domain/services";
import { validateIdParam, notFound, badRequest, serverError } from "../../../../lib/api-helpers";
import { detectPackageManager, detectBuildCommand } from "../../../../lib/project-runtime";
import { spawnInTerminal } from "../../../../lib/terminal";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Params) {
  const { value: id, error } = validateIdParam((await params).id);
  if (error) return error;

  const project = projects.readProject(id);
  if (!project) return notFound();

  const cwd = project.meta.cwd;
  if (!cwd || !isAbsolute(cwd) || !existsSync(cwd)) return Response.json({ hasBuild: false });

  return Response.json({ hasBuild: !!detectBuildCommand(cwd, detectPackageManager(cwd)) });
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

  const pid = await spawnInTerminal("Build", cwd, argv);
  if (pid === null) return serverError("terminal_start_failed");
  return Response.json({ pid });
}
