import { NextResponse } from "next/server";
import { projects, db as dbService } from "@agent-office/domain/services";
import { validateBody } from "@/lib/validation";
import { projectMetaPatchSchema } from "@/lib/validation-schemas";
import { notFound, tryService, validateIdParam } from "@/lib/api-helpers";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  const { value: id, error } = validateIdParam((await params).id);
  if (error) return error;
  const p = projects.readProject(id);
  if (!p) return notFound();
  let runCount = 0;
  let lastRunAt: number | undefined;
  try {
    const row = dbService.getDb()
      .prepare("SELECT COUNT(*) as count, MAX(started_at) as last_run FROM runs WHERE project_id = ?")
      .get(id) as { count: number; last_run: number | null };
    runCount = row.count;
    lastRunAt = row.last_run ?? undefined;
  } catch { /* db not ready */ }
  // Annotate roster with transient worktree health so the UI can flag instances
  // that need repair. Not persisted — stripped on the next metadata read/write.
  const roster = p.meta.roster.map((inst) => {
    const missing = projects.instanceWorktreeMissing(p, inst);
    return missing ? { ...inst, worktreeMissing: true } : inst;
  });
  return NextResponse.json({ ...p, meta: { ...p.meta, roster }, runCount, lastRunAt });
}

export async function PUT(request: Request, { params }: Params) {
  const { value: id, error: paramError } = validateIdParam((await params).id);
  if (paramError) return paramError;
  const raw: unknown = await request.json();
  const { data, error } = validateBody(projectMetaPatchSchema, raw);
  if (error) return error;
  // The schema allows `accountId`/`githubAccountId: null` (client's way to clear
  // the field); the domain type is `string | undefined`. Coerce null → undefined.
  const meta = data.meta
    ? {
        ...data.meta,
        accountId: data.meta.accountId ?? undefined,
        githubAccountId: data.meta.githubAccountId ?? undefined,
      }
    : undefined;
  const normalized = { memory: data.memory, meta };
  return tryService(() => projects.updateProject(id, normalized));
}

export async function DELETE(_request: Request, { params }: Params) {
  const { value: id, error } = validateIdParam((await params).id);
  if (error) return error;
  return projects.deleteProject(id) ? NextResponse.json({ deleted: id }) : notFound();
}
