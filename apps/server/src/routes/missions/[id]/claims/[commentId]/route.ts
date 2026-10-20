// POST /api/missions/<id>/claims/<commentId> — the lead accepts or rejects a device's claim.
import { missions } from "@agent-office/domain/services";
import { missionClaimDecisionSchema } from "@agent-office/api-contract";
import { missionBody, missionComment, missionResponse, type MissionCommentParams } from "../../../../../lib/mission-route";
import { validateBody } from "../../../../../lib/validation";

export async function POST(request: Request, ctx: MissionCommentParams) {
  const m = await missionComment(request, ctx);
  if (m.error) return m.error;
  const body = await missionBody(request);
  if (body.error) return body.error;
  const { data, error } = validateBody(missionClaimDecisionSchema, body.raw);
  if (error) return error;
  return missionResponse(await missions.decideClaim(m.missionId, m.commentId, data.accept));
}
