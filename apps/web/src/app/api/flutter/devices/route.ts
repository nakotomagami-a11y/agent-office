// GET /api/flutter/devices — list available Flutter run targets/devices.
// Gated on the `flutter` integration toggle.
import { NextResponse } from "next/server";
import { requireIntegration } from "@/lib/api-helpers";
import { listDevices } from "@/lib/server/flutter";

export async function GET() {
  const gate = requireIntegration("flutter");
  if (gate) return gate;
  return NextResponse.json(await listDevices());
}
