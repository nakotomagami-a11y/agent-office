import { NextResponse } from "next/server";
import { analytics } from "@agent-office/domain/services";

// Per-account rollup for the placeholder stats panel on Settings → Accounts.
// Real analytics UI is deferred to a designer session per the spec.
export async function GET() {
  return NextResponse.json(analytics.listPerAccountStats());
}
