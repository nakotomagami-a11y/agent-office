// GET /api/analytics/summary — period-scoped analytics totals, aggregated in SQL
// (replaces the old fetch-500-runs-and-sum-in-browser approach).
// Query: start (epoch ms incl, default 0), end (epoch ms excl, optional),
// project (optional scope), days (also return per-day spend for the trailing N days).
import { NextResponse } from "next/server";
import { analyticsSummary } from "@agent-office/domain/services";
import { badRequest } from "@/lib/api-helpers";

export async function GET(request: Request) {
  const url = new URL(request.url);

  const rawStart = url.searchParams.get("start");
  const rawEnd = url.searchParams.get("end");
  const rawDays = url.searchParams.get("days");
  const projectId = url.searchParams.get("project") ?? undefined;

  const start = rawStart === null ? 0 : Number(rawStart);
  const end = rawEnd === null ? Number.POSITIVE_INFINITY : Number(rawEnd);

  if (!Number.isFinite(start) || start < 0) return badRequest("invalid start");
  if (rawEnd !== null && !Number.isFinite(end)) return badRequest("invalid end");
  if (end <= start) return badRequest("end must be greater than start");

  const summary = analyticsSummary.getAnalyticsSummary({ start, end, projectId });

  if (rawDays === null) return NextResponse.json(summary);

  const days = Number(rawDays);
  if (!Number.isInteger(days) || days < 1 || days > 365) {
    return badRequest("days must be an integer between 1 and 365");
  }

  return NextResponse.json({
    ...summary,
    dailySpend: analyticsSummary.getDailySpend(days, projectId),
  });
}
