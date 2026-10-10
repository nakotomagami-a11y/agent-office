// GET/PUT /api/dev/planet-gallery — persists the working set of planet configs
// used by the /dev/planet-gallery screenshot tool. Dev-only: 404s in production.
import { db } from "@agent-office/domain/services";
import { forbidInProd } from "../../../lib/api-helpers";
import { parseJson, asRecord } from "@agent-office/api-contract";

const KEY = "dev.planet-gallery";

export async function GET() {
  const gate = forbidInProd();
  if (gate) return gate;

  const raw = db.getUiSetting(KEY);
  let configs: Record<string, unknown> = {};
  if (raw) {
    try {
      configs = asRecord(parseJson(raw)) ?? {};
    } catch {
      // Corrupt/old-shape value — treat as empty so the page falls back to defaults.
    }
  }
  return Response.json({ configs });
}

export async function PUT(request: Request) {
  const gate = forbidInProd();
  if (gate) return gate;

  let body: { configs?: unknown };
  try {
    body = (await request.json()) as { configs?: unknown };
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }
  if (!body.configs || typeof body.configs !== "object") {
    return Response.json({ error: "invalid_body" }, { status: 400 });
  }

  db.setUiSetting(KEY, JSON.stringify(body.configs));
  return Response.json({ ok: true });
}
