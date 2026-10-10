// GET /api/projects/<id>/reviews — the project's open GitHub pull requests (via gh).
import { review } from "@agent-office/domain/services";
import { reviewProject, reviewResponse, type ProjectParams } from "../../../../lib/review-route";

export async function GET(request: Request, ctx: ProjectParams) {
  const t = await reviewProject(request, ctx);
  if (t.error) return t.error;
  return reviewResponse(await review.listPulls(t.project));
}
