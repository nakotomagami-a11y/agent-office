// GET /api/agents/<id>/uploads/<filename> — serve one uploaded
// file from the agent's upload dir. Filename safety is enforced by the helpers.
import { paths } from "@agent-office/domain/services";
import { handleServeUpload, validateIdParam } from "../../../../../lib/api-helpers";

type Params = { params: Promise<{ id: string; filename: string }> };

export async function GET(_request: Request, { params }: Params) {
  const { id, filename } = await params;
  const idCheck = validateIdParam(id);
  if (idCheck.error) return idCheck.error;
  return handleServeUpload(paths.agentUploadsDir(idCheck.value), filename);
}
