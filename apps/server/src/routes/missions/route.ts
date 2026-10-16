// GET /api/missions?projectId= — open mission hubs to join; POST /api/missions — start one (docs/missions.md).
import { missions } from "@agent-office/domain/services";
import { missionStartSchema } from "@agent-office/api-contract";
import { badRequest, refuseCrossSite, validateIdParam } from "../../lib/api-helpers";
import { missionBody, missionResponse } from "../../lib/mission-route";
import { validateBody } from "../../lib/validation";

export async function GET(request: Request) {
  const denied = refuseCrossSite(request);
  if (denied) return denied;
  const raw = new URL(request.url).searchParams.get("projectId");
  if (!raw) return badRequest("project_required");
  const id = validateIdParam(raw);
  if (id.error) return id.error;
  return missionResponse(await missions.joinableHubs(id.value));
}

export async function POST(request: Request) {
  const body = await missionBody(request);
  if (body.error) return body.error;
  const { data, error } = validateBody(missionStartSchema, body.raw);
  if (error) return error;
  const { projectId, ...input } = data;
  return missionResponse(await missions.startMission(projectId, input));
}
