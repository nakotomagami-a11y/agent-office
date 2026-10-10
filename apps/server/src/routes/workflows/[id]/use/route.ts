// POST /api/workflows/<id>/use — mark a workflow used (bumps its use count).
import { store } from "@agent-office/domain/services";

type Params = { params: Promise<{ id: string }> };

export async function POST(_request: Request, { params }: Params) {
  const { id } = await params;
  store.recordWorkflowUsage(id);
  return new Response(null, { status: 204 });
}
