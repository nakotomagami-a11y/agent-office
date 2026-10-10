// POST /api/projects/<id>/reviews/<number>/reject — close the PR unmerged (branch kept) with a reason.
import { review } from "@agent-office/domain/services";
import { reviewRejectSchema } from "@agent-office/api-contract";
import { validateBody } from "../../../../../../lib/validation";
import { reviewBody, reviewPull, reviewResponse, type PullParams } from "../../../../../../lib/review-route";

export async function POST(request: Request, ctx: PullParams) {
  const t = await reviewPull(request, ctx);
  if (t.error) return t.error;
  const body = await reviewBody(request);
  if (body.error) return body.error;
  const { data, error } = validateBody(reviewRejectSchema, body.raw);
  if (error) return error;
  return reviewResponse(await review.rejectPull(t.project, t.number, data));
}
