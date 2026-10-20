// PUT /api/providers/<id> { baseUrl?, apiKey?, models? } — save a provider's config. A changed URL
// clears the stored key unless the same request carries a new one.
import { providers } from "@agent-office/domain/services";
import { isProvider } from "@agent-office/domain/config/providers";
import { providerConfigPutSchema } from "@agent-office/api-contract";
import { badRequest } from "../../../lib/api-helpers";
import { validateBody } from "../../../lib/validation";

type Params = { params: Promise<{ id: string }> };

export async function PUT(request: Request, { params }: Params) {
  const { id } = await params;
  if (!isProvider(id) || id === "subscription") return badRequest("invalid_provider");
  const raw: unknown = await request.json().catch(() => null);
  const { data, error } = validateBody(providerConfigPutSchema, raw);
  if (error) return error;
  const result = providers.saveConfig(id, data);
  if (!result.ok) return badRequest(result.reason);
  return Response.json(await providers.providersView());
}
