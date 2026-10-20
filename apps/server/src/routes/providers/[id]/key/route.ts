// DELETE /api/providers/<id>/key — forget a provider's stored key and the URL it was bound to.
import { providers } from "@agent-office/domain/services";
import { isProvider } from "@agent-office/domain/config/providers";
import { badRequest } from "../../../../lib/api-helpers";

type Params = { params: Promise<{ id: string }> };

export async function DELETE(_request: Request, { params }: Params) {
  const { id } = await params;
  if (!isProvider(id) || id === "subscription") return badRequest("invalid_provider");
  providers.deleteProviderKey(id);
  providers.forgetStatus(id);
  return Response.json(await providers.providersView());
}
