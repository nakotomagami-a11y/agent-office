// POST /api/missions/<id>/leave — give up a seat this device holds.
import { missions } from "@agent-office/domain/services";
import { missionLeaveSchema } from "@agent-office/api-contract";
import { missionBody, missionId, missionResponse, type MissionParams } from "../../../../lib/mission-route";
import { validateBody } from "../../../../lib/validation";

export async function POST(request: Request, ctx: MissionParams) {
  const m = await missionId(request, ctx);
  if (m.error) return m.error;
  const body = await missionBody(request);
  if (body.error) return body.error;
  const { data, error } = validateBody(missionLeaveSchema, body.raw);
  if (error) return error;
  return missionResponse(await missions.leaveSeat(m.missionId, data.seat));
}
