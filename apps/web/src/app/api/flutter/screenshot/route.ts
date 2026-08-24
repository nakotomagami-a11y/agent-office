// GET /api/flutter/screenshot — capture a PNG screenshot from the device via adb.
// Gated on the `flutter` integration toggle.
import { NextResponse } from "next/server";
import { requireIntegration } from "@/lib/api-helpers";
import { captureScreenshot } from "@/lib/server/flutter";

export async function GET(req: Request) {
  const gate = requireIntegration("flutter");
  if (gate) return gate;
  const deviceId = new URL(req.url).searchParams.get("deviceId") ?? undefined;

  const shot = await captureScreenshot(deviceId);
  if (!shot.ok) return NextResponse.json({ error: shot.error }, { status: shot.status });
  return new Response(new Uint8Array(shot.png), {
    headers: { "Content-Type": "image/png", "Cache-Control": "no-store" },
  });
}
