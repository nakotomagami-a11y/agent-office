// POST /api/missions/claim — claim a seat in a mission hub from this device.
import { missions } from "@agent-office/domain/services";
import { missionClaimSchema } from "@agent-office/api-contract";
import { missionBody, missionResponse } from "../../../lib/mission-route";
import { validateBody } from "../../../lib/validation";

export async function POST(request: Request) {
  const body = await missionBody(request);
  if (body.error) return body.error;
  const { data, error } = validateBody(missionClaimSchema, body.raw);
  if (error) return error;
  return missionResponse(await missions.claimSeat(data));
}
