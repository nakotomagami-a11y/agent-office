// POST/DELETE /api/flutter/mirror — start or stop an always-on-top device mirror
// window (scrcpy). Gated on the `flutter` integration toggle.
import { requireIntegration } from "../../../lib/api-helpers";
import { startMirror, stopMirror } from "../../../lib/flutter";

export async function POST(req: Request) {
  const gate = requireIntegration("flutter");
  if (gate) return gate;
  let body: { deviceId?: string } = {};
  try { body = await req.json() as { deviceId?: string }; } catch { /* no body */ }
  return Response.json({ pid: startMirror(body.deviceId) });
}

export async function DELETE() {
  const gate = requireIntegration("flutter");
  if (gate) return gate;
  stopMirror();
  return Response.json({ ok: true });
}
