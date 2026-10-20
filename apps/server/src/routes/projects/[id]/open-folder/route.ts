// POST /api/projects/<id>/open-folder[?app=code] — open the project's working directory in
// the host OS file manager, or in VS Code.
import { statSync } from "node:fs";
import { resolve } from "node:path";
import { projects } from "@agent-office/domain/services";
import { expandTilde } from "@agent-office/domain/services/infra/paths";
import { log } from "@agent-office/domain/services/infra/log";
import { validateIdParam, notFound, badRequest } from "../../../../lib/api-helpers";
import { isOpenablePath, launchDetached, openCommand } from "../../../../lib/os-opener";

type Params = { params: Promise<{ id: string }> };

export async function POST(req: Request, { params }: Params) {
  const { id } = await params;
  const { value, error } = validateIdParam(id);
  if (error) return error;

  const project = projects.readProject(value);
  if (!project) return notFound("Project");

  const raw = project.meta.cwd ? expandTilde(project.meta.cwd) : "";
  if (!raw || !isOpenablePath(raw)) return badRequest("no_cwd");
  const cwd = resolve(raw);
  let isDir: boolean;
  try {
    isDir = statSync(cwd, { throwIfNoEntry: false })?.isDirectory() ?? false;
  } catch {
    return Response.json({ error: "cwd_unreadable" }, { status: 403 });
  }
  if (!isDir) return notFound("cwd_missing");

  const app = new URL(req.url).searchParams.get("app") === "code" ? "code" : "folder";
  const failed = app === "code" ? "editor_not_found" : "open_failed";
  const command = openCommand(app, cwd);
  if (!command) return Response.json({ error: failed }, { status: app === "code" ? 404 : 500 });

  const result = await launchDetached(command);
  if (!result.ok) {
    log.warn("open_folder.failed", { projectId: value, app, cmd: command.cmd, detail: result.detail });
    return Response.json({ error: failed, detail: result.detail }, { status: app === "code" ? 404 : 500 });
  }
  return Response.json({ ok: true });
}
