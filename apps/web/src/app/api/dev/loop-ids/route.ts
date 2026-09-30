// Dev-only: ids of recorded loops, for the /dev/loop harness.
import { NextResponse } from "next/server";
import { db } from "@agent-office/domain/services";
import { forbidInProd } from "@/lib/api-helpers";

export const dynamic = "force-dynamic";

export function GET() {
  const gate = forbidInProd();
  if (gate) return gate;
  return NextResponse.json(db.listAllLoopIds());
}
