// GET /api/analytics/page — everything the /analytics page renders in one round
// trip (~8 aggregations + a filled time series). One request on purpose: the page
// shows it all at once, so parallel fetches would only add latency/waterfalls.
// Query: start (epoch ms incl, default 0), end (epoch ms excl, optional), project.
import { NextResponse } from "next/server";
import { analyticsPage } from "@agent-office/domain/services";
import { badRequest } from "@/lib/api-helpers";

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
