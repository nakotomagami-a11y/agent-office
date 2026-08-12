import { NextResponse } from "next/server";
import { analyticsPage } from "@agent-office/domain/services";
import { badRequest } from "@/lib/api-helpers";

/**
 * Everything the `/analytics` page renders, in one round trip.
 *
 * Separate from `/api/analytics/summary` (which backs the older three-number
 * overview) because this one returns ~8 aggregations and a filled time
 * series. Kept as a single request on purpose: the page shows all of it at
 * once, so eight parallel fetches would only add latency and waterfalls.
 *
 * Query params:
 *   start    epoch ms, inclusive. Defaults to 0 (all time).
 *   end      epoch ms, exclusive. Omit for no upper bound.
 *   project  optional project scope.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);

  const rawStart = url.searchParams.get("start");
  const rawEnd = url.searchParams.get("end");
  const projectId = url.searchParams.get("project") ?? undefined;

  const start = rawStart === null ? 0 : Number(rawStart);
  const end = rawEnd === null ? Number.POSITIVE_INFINITY : Number(rawEnd);

  if (!Number.isFinite(start) || start < 0) return badRequest("invalid start");
  if (rawEnd !== null && !Number.isFinite(end)) return badRequest("invalid end");
  if (end <= start) return badRequest("end must be greater than start");

  return NextResponse.json(analyticsPage.getAnalyticsPage({ start, end, projectId }));
}
