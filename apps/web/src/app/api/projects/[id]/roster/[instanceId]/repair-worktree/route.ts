import { projects } from "@agent-office/domain/services";
import { notFound, tryService, validateIdParam } from "@/lib/api-helpers";

type Params = { params: Promise<{ id: string; instanceId: string }> };

/**
 * Repair (recreate) a missing git worktree for an instance, or clear its dead
 * pin so it falls back to the shared project cwd. Idempotent.
 */
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

  return tryService(() => {
    const cwd = projects.resolveInstanceCwd(project, instance);
    return { ok: true, cwd: cwd ?? project.meta.cwd ?? null };
  });
}
