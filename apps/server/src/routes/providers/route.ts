// GET /api/providers — the AI provider choice, each provider's config and status. No network call:
// statuses are presence checks plus the last probe, if fresh. Never returns key material.
import { providers } from "@agent-office/domain/services";

export async function GET() {
  return Response.json(await providers.providersView());
}
