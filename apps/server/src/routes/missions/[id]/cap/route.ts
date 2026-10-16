// POST /api/missions/<id>/cap — "allow +$N" for a seat on this device.
import { missions } from "@agent-office/domain/services";
import { missionCapSchema } from "@agent-office/api-contract";
import { missionBody, missionId, missionResponse, type MissionParams } from "../../../../lib/mission-route";
import { validateBody } from "../../../../lib/validation";

export async function POST(request: Request, ctx: MissionParams) {
  const m = await missionId(request, ctx);
  if (m.error) return m.error;
  const body = await missionBody(request);
  if (body.error) return body.error;
  const { data, error } = validateBody(missionCapSchema, body.raw);
  if (error) return error;
  return missionResponse(await missions.raiseSeatCap(m.missionId, data.seat, data.byUsd));
}
