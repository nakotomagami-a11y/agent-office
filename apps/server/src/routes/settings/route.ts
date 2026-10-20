// GET/PATCH/PUT /api/settings — app settings (projects root, exclusions, feature
// flags, first-run state). PATCH is a partial merge; PUT replaces the core config.
import { providers, settings } from "@agent-office/domain/services";
import { validateBody } from "../../lib/validation";
import { settingsMergePatchSchema, settingsPatchSchema } from "@agent-office/api-contract";

export async function GET() {
  return Response.json(settings.readSettings());
}

// Partial merge: PATCH { features: { multiInstance } } for feature flags, or
// { firstRunComplete } to re-arm the first-run wizard (dev console "Launch first-run wizard").
const providerRequired = (): Response | null =>
  providers.currentProvider().needsSetup ? Response.json({ error: "provider_required" }, { status: 400 }) : null;

export async function PATCH(request: Request) {
  const raw: unknown = await request.json();
  const { data: patch, error } = validateBody(settingsMergePatchSchema, raw);
  if (error) return error;
  if (patch.firstRunComplete === true) {
    const required = providerRequired();
    if (required) return required;
  }
  const current = settings.readSettings();
  if (!current) return Response.json({ error: "settings_not_initialized" }, { status: 400 });
  if (patch.features) current.features = { ...(current.features ?? {}), ...patch.features };
  if (patch.integrations) current.integrations = { ...(current.integrations ?? {}), ...patch.integrations };
  if (typeof patch.firstRunComplete === "boolean") current.firstRunComplete = patch.firstRunComplete;
  settings.writeSettings(current);
  return Response.json(current);
}

export async function PUT(request: Request) {
  const raw: unknown = await request.json();
  const { data, error } = validateBody(settingsPatchSchema, raw);
  if (error) return error;
  const required = providerRequired();
  if (required) return required;
  const next = settings.withProjectsConfig(settings.readSettings(), data);
  settings.writeSettings(next);
  return Response.json(next);
}
