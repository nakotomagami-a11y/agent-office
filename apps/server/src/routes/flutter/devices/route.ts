// GET /api/flutter/devices — list available Flutter run targets/devices.
// Gated on the `flutter` integration toggle.
import { requireIntegration } from "../../../lib/api-helpers";
import { listDevices } from "../../../lib/flutter";

export async function GET() {
  const gate = requireIntegration("flutter");
  if (gate) return gate;
  return Response.json(await listDevices());
}
