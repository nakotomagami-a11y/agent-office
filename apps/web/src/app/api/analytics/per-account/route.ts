// GET /api/analytics/per-account — per-account usage rollup for the placeholder
// stats panel on Settings → Accounts (real analytics UI deferred).
import { NextResponse } from "next/server";
import { analytics } from "@agent-office/domain/services";

export async function GET() {
  return NextResponse.json(analytics.listPerAccountStats());
}
