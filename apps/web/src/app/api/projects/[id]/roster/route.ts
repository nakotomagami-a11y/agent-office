import { NextResponse } from "next/server";
import { projects, settings } from "@agent-office/domain/services";
import { InstanceCapError } from "@agent-office/domain/services/projects";
import { validateBody } from "@/lib/validation";
import { rosterAddSchema } from "@/lib/validation-schemas";
import { tryService, validateIdParam } from "@/lib/api-helpers";

type Params = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Params) {
  const { value: id, error: paramError } = validateIdParam((await params).id);
  if (paramError) return paramError;
  const raw: unknown = await request.json();
  const { data, error } = validateBody(rosterAddSchema, raw);
  if (error) return error;

  // Handle instance cap errors with a typed 409 before delegating the rest
  // to tryService (which would convert them to a generic 500).
  const appSettings = settings.readSettings();
  let result: ReturnType<typeof projects.addInstance>;
  try {
    result = projects.addInstance(id, data.agentId, data.init, appSettings, data.force);
  } catch (e) {
    if (e instanceof InstanceCapError) {
      return NextResponse.json(
        { error: "INSTANCE_CAP_EXCEEDED", softCap: e.softCap, count: e.count },
        { status: 409 },
      );
    }
    // Re-throw so tryService-equivalent error mapping can handle it below.
    return tryService(() => { throw e; });
  }
  return NextResponse.json(result);
}
