import { paths } from "@agent-office/domain/services";
import { handleDeleteUpload, handleServeUpload, validateIdParam } from "@/lib/api-helpers";

type Params = { params: Promise<{ id: string; filename: string }> };

export async function GET(_request: Request, { params }: Params) {
  const { id, filename } = await params;
  const idCheck = validateIdParam(id);
  if (idCheck.error) return idCheck.error;
  return handleServeUpload(paths.agentUploadsDir(idCheck.value), filename);
}

export async function DELETE(_request: Request, { params }: Params) {
  const { id, filename } = await params;
  const idCheck = validateIdParam(id);
  if (idCheck.error) return idCheck.error;
  return handleDeleteUpload(paths.agentUploadsDir(idCheck.value), filename);
}
