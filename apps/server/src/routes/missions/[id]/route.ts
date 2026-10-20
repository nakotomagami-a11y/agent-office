// GET /api/missions/<id> — the mission as this device sees it, folded fresh from the hub.
import { missions } from "@agent-office/domain/services";
import { missionId, missionResponse, type MissionParams } from "../../../lib/mission-route";

export async function GET(request: Request, ctx: MissionParams) {
  const m = await missionId(request, ctx);
  if (m.error) return m.error;
  return missionResponse(await missions.missionView(m.missionId));
}
