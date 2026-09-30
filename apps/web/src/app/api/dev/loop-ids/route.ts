// Dev-only: ids of recorded loops, for the /dev/loop harness.
import { NextResponse } from "next/server";
import { db } from "@agent-office/domain/services";

export const dynamic = "force-dynamic";

export function GET() {
  const rows = db.listAllLoopIds?.() ?? [];
  return NextResponse.json(rows);
}
