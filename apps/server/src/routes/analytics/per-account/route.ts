// GET /api/analytics/per-account — per-account usage rollup for the placeholder
// stats panel on Settings → Accounts (real analytics UI deferred).
import { analytics } from "@agent-office/domain/services";

export async function GET() {
  return Response.json(analytics.listPerAccountStats());
}
