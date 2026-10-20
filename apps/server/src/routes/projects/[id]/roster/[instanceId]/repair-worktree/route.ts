// POST /api/projects/<id>/roster/<instanceId>/repair-worktree — recreate a missing git worktree;
// 409 worktree_unrepairable when it cannot be (never a fall back to the shared cwd).
import { projects } from "@agent-office/domain/services";
import { conflict, notFound, tryService, validateIdParam } from "../../../../../../lib/api-helpers";

type Params = { params: Promise<{ id: string; instanceId: string }> };

export async function POST(_request: Request, { params }: Params) {
  const { id, instanceId } = await params;
  const idCheck = validateIdParam(id);
  if (idCheck.error) return idCheck.error;
  const instCheck = validateIdParam(instanceId);
  if (instCheck.error) return instCheck.error;

  const project = projects.readProject(idCheck.value);
  if (!project) return notFound();
  const instance = project.meta.roster.find((i) => i.instanceId === instCheck.value);
  if (!instance) return notFound();

  let cwd: string | undefined;
  try {
    cwd = projects.resolveInstanceCwd(project, instance);
  } catch (e) {
    return tryService(() => { throw e; });
  }
  if (projects.instanceWorktreeMissing(project, instance)) return conflict("worktree_unrepairable");
  return Response.json({ ok: true, cwd: cwd ?? project.meta.cwd ?? null });
}
