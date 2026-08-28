// DELETE /api/projects/<id>/folder — permanently delete the project's folder
//   from disk (recursive) plus its ~/.claude/projects/<id> metadata. Destructive
//   and irreversible; the UI gates this behind a type-to-confirm modal. The
//   domain guard refuses anything that isn't a direct child of the projects root.
import { projects } from "@agent-office/domain/services";
import { tryService, validateIdParam } from "@/lib/api-helpers";

type Params = { params: Promise<{ id: string }> };

export async function DELETE(_request: Request, { params }: Params) {
  const { value: id, error } = validateIdParam((await params).id);
  if (error) return error;
  return tryService(() => {
    const removed = projects.removeProjectFolder(id);
    if (!removed) throw new Error("project not found");
    return { removed: id };
  });
}
