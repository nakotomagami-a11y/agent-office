// POST /api/providers/<id>/test { draft? } — one cheap authenticated call, classified. No draft:
// the stored config. A draft URL other than the stored one is tested with the draft's key only.
import { health, providers } from "@agent-office/domain/services";
import { isProvider } from "@agent-office/domain/config/providers";
import { providerTestSchema } from "@agent-office/api-contract";
import { badRequest } from "../../../../lib/api-helpers";
import { validateBody } from "../../../../lib/validation";

type Params = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Params) {
  const { id } = await params;
  if (!isProvider(id)) return badRequest("invalid_provider");
  const raw: unknown = await request.json().catch(() => ({}));
  const { data, error } = validateBody(providerTestSchema, raw);
  if (error) return error;
  // "Re-check" must see a CLI installed since the last probe.
  await health.getHealth(true);
  return Response.json(await providers.testProvider(id, data.draft));
}
