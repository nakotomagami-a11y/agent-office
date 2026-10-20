// PUT /api/model-prices/settings { fetchEnabled } — the outbound price-fetch switch. Off: no fetch,
// every price unknown, capped openai runs refused. Answers the full catalog view.
import { providers } from "@agent-office/domain/services";
import { modelPricesSettingsPutSchema } from "@agent-office/api-contract";
import { validateBody } from "../../../lib/validation";

export async function PUT(request: Request) {
  const raw: unknown = await request.json().catch(() => null);
  const { data, error } = validateBody(modelPricesSettingsPutSchema, raw);
  if (error) return error;
  return Response.json(providers.setPriceFetchEnabled(data.fetchEnabled));
}
