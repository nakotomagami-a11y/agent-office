// PUT /api/projects/<id>/reviews/<number>/link — pick the roster seat that gets this PR's feedback.
import { review } from "@agent-office/domain/services";
import { reviewLinkSchema } from "@agent-office/api-contract";
import { validateBody } from "../../../../../../lib/validation";
import { reviewBody, reviewPull, reviewResponse, type PullParams } from "../../../../../../lib/review-route";

export async function PUT(request: Request, ctx: PullParams) {
  const t = await reviewPull(request, ctx);
  if (t.error) return t.error;
  const body = await reviewBody(request);
  if (body.error) return body.error;
  const { data, error } = validateBody(reviewLinkSchema, body.raw);
  if (error) return error;
  return reviewResponse(await review.linkPull(t.project, t.number, data.agentId, data.instanceId));
}
