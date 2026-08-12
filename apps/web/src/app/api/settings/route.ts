import { NextResponse } from "next/server";
import { settings } from "@agent-office/domain/services";
import { validateBody } from "@/lib/validation";
import { settingsPatchSchema } from "@/lib/validation-schemas";
import type { AppSettings } from "@agent-office/domain/types";

export async function GET() {
  return NextResponse.json(settings.readSettings());
}

/**
 * Partial-update: PATCH { features: { multiInstance: boolean } } for feature
 * flags, or PATCH { firstRunComplete: boolean } to re-arm the first-run wizard
 * (used by the dev console's "Reset onboarding").
 */
export async function PATCH(request: Request) {
  const raw: unknown = await request.json();
  const current = settings.readSettings();
  if (!current) return NextResponse.json({ error: "settings not initialized" }, { status: 400 });
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    const patch = raw as Record<string, unknown>;
    if (patch.features && typeof patch.features === "object" && !Array.isArray(patch.features)) {
      current.features = {
        ...(current.features ?? {}),
        ...(patch.features as AppSettings["features"]),
      };
    }
    if (typeof patch.firstRunComplete === "boolean") {
      current.firstRunComplete = patch.firstRunComplete;
    }
  }
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
