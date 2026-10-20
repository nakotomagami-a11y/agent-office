// DELETE /api/projects/<id>/folder?path=<fullPath> — permanently delete the
//   project's folder from disk (recursive) plus its ~/.claude/projects/<id>
//   metadata. Destructive and irreversible; the UI gates this behind a
//   type-to-confirm modal. 404 unless `path` is the folder `id` names under the
//   saved projects root, so a stale or ambiguous id never deletes another folder.
import { projects } from "@agent-office/domain/services";
import { projectFolderDeleteQuerySchema } from "@agent-office/api-contract";
import { notFound, tryService, validateIdParam } from "../../../../lib/api-helpers";
import { validateQuery } from "../../../../lib/validation";

type Params = { params: Promise<{ id: string }> };

export async function DELETE(request: Request, { params }: Params) {
  const { value: id, error } = validateIdParam((await params).id);
  if (error) return error;
  const { data: q, error: queryError } = validateQuery(projectFolderDeleteQuerySchema, new URL(request.url).searchParams);
  if (queryError) return queryError;
  let removed = false;
  const res = await tryService(() => {
    removed = projects.removeProjectFolder(id, q.path);
    return { removed: id };
  });
  return res.ok && !removed ? notFound("folder_mismatch") : res;
}
