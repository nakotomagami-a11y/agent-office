// GET /api/projects/<id>/dev — detect runnable dev commands for the project.
// POST — pick a free port, then launch the chosen dev command in an OS terminal
// window with an nvm-safe PATH; returns the pid of the shell running it.
import { existsSync } from "node:fs";
import { join, isAbsolute } from "node:path";
import { projects } from "@agent-office/domain/services";
import { validateIdParam, notFound, badRequest, serverError } from "../../../../lib/api-helpers";
import { detectPackageManager, detectDevCommands, findFreePort } from "../../../../lib/project-runtime";
import { spawnInTerminal } from "../../../../lib/terminal";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Params) {
  const { value: id, error } = validateIdParam((await params).id);
  if (error) return error;

  const project = projects.readProject(id);
  if (!project) return notFound();

  const cwd = project.meta.cwd;
  if (!cwd || !isAbsolute(cwd) || !existsSync(cwd)) {
    return Response.json({ hasNodeModules: false, pm: "npm", commands: [] });
  }

  const commands = detectDevCommands(cwd);
  // Report package.json/node_modules presence from wherever the dev commands
  // actually live (root, or a frontend/ subfolder) so the Install button stays accurate.
  const primaryDir = commands[0]?.cwd ?? cwd;
  const hasPackageJson = existsSync(join(primaryDir, "package.json")) || existsSync(join(cwd, "package.json"));
  const hasNodeModules = existsSync(join(primaryDir, "node_modules"));
  return Response.json({ hasPackageJson, hasNodeModules, pm: detectPackageManager(cwd), commands });
}

export async function POST(req: Request, { params }: Params) {
  const { value: id, error } = validateIdParam((await params).id);
  if (error) return error;

  const project = projects.readProject(id);
  if (!project) return notFound();

  const cwd = project.meta.cwd;
  if (!cwd || !isAbsolute(cwd) || !existsSync(cwd)) return badRequest("working_directory_not_found");

  let body: { commandKey?: string } = {};
  if ((req.headers.get("content-type") ?? "").includes("application/json")) {
    try { body = await req.json() as { commandKey?: string }; } catch {
      return badRequest("invalid_json");
    }
  }

  const commands = detectDevCommands(cwd);
  const command = (body.commandKey ? commands.find((c) => c.key === body.commandKey) : null) ?? commands[0];
  if (!command) return badRequest("no_dev_command");

  const port = await findFreePort(3001);
  // The port reaches the command as the PORT env var (exported by spawnInTerminal): appending
  // `-- -p port` breaks Next.js ≥ v13, which treats `--` as a directory argument.
  const pid = await spawnInTerminal(command.name, command.cwd ?? cwd, command.argv, port);
  if (pid === null) return serverError("terminal_start_failed");

  return Response.json({
    key: command.key,
    port,
    url: `http://localhost:${port}`,
    pid,
  });
}
