// GET /api/projects/<id>/reviews/<number> — one PR: parsed diff, checks, notes, and the seat its feedback goes to.
import { review } from "@agent-office/domain/services";
import { reviewPull, reviewResponse, type PullParams } from "../../../../../lib/review-route";

export async function GET(request: Request, ctx: PullParams) {
  const t = await reviewPull(request, ctx);
  if (t.error) return t.error;
  return reviewResponse(await review.getPull(t.project, t.number));
}
