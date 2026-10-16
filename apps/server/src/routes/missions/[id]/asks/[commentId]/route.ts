// POST /api/missions/<id>/asks/<commentId> — the human answers a seat's question, or rules on a decision.
import { missions } from "@agent-office/domain/services";
import { missionAnswerSchema } from "@agent-office/api-contract";
import { missionBody, missionComment, missionResponse, type MissionCommentParams } from "../../../../../lib/mission-route";
import { validateBody } from "../../../../../lib/validation";

export async function POST(request: Request, ctx: MissionCommentParams) {
  const m = await missionComment(request, ctx);
  if (m.error) return m.error;
  const body = await missionBody(request);
  if (body.error) return body.error;
  const { data, error } = validateBody(missionAnswerSchema, body.raw);
  if (error) return error;
  return missionResponse(await missions.answerAsk(m.missionId, m.commentId, data.text));
}
