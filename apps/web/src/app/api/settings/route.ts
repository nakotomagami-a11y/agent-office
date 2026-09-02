// GET/PATCH/PUT /api/settings — app settings (projects root, exclusions, feature
// flags, first-run state). PATCH is a partial merge; PUT replaces the core config.
import { NextResponse } from "next/server";
import { settings } from "@agent-office/domain/services";
import { validateBody } from "@/lib/validation";
import { settingsMergePatchSchema, settingsPatchSchema } from "@/lib/validation-schemas";

export async function GET() {
  return NextResponse.json(settings.readSettings());
}

// Partial merge: PATCH { features: { multiInstance } } for feature flags, or
// { firstRunComplete } to re-arm the first-run wizard (dev console "Launch first-run wizard").
export async function PATCH(request: Request) {
  const raw: unknown = await request.json();
  const current = settings.readSettings();
  if (!current) return NextResponse.json({ error: "settings_not_initialized" }, { status: 400 });
  const { data: patch, error } = validateBody(settingsMergePatchSchema, raw);
  if (error) return error;
  if (patch.features) current.features = { ...(current.features ?? {}), ...patch.features };
  if (patch.integrations) current.integrations = { ...(current.integrations ?? {}), ...patch.integrations };
  if (typeof patch.firstRunComplete === "boolean") current.firstRunComplete = patch.firstRunComplete;
  settings.writeSettings(current);
  return NextResponse.json(current);
}

export async function PUT(request: Request) {
  const raw: unknown = await request.json();
  const { data, error } = validateBody(settingsPatchSchema, raw);
  if (error) return error;
  const next = {
    projectsRoot: data.projectsRoot.trim(),
    excluded: data.excluded.filter((s) => typeof s === "string"),
    firstRunComplete: true,
  };
  settings.writeSettings(next);
  return NextResponse.json(next);
}
