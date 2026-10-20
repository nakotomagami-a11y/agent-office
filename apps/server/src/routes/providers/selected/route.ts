// PUT /api/providers/selected { provider, acceptUnavailable? } — choose the provider agents run on.
// The server probes the stored config; a block reason always refuses (409 provider_not_ready).
import { providers } from "@agent-office/domain/services";
import { providerSelectedPutSchema } from "@agent-office/api-contract";
import { conflict } from "../../../lib/api-helpers";
import { validateBody } from "../../../lib/validation";

export async function PUT(request: Request) {
  const raw: unknown = await request.json().catch(() => null);
  const { data, error } = validateBody(providerSelectedPutSchema, raw);
  if (error) return error;
  const result = await providers.selectProvider(data.provider, data.acceptUnavailable === true);
  if (!result.ok) return conflict("provider_not_ready", { reason: result.reason, detail: result.detail });
  return Response.json(await providers.providersView());
}
