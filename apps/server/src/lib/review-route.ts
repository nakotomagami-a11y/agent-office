// Shared steps of the /api/projects/:id/reviews/* routes.
import { projects, type review } from "@agent-office/domain/services";
import type { Project } from "@agent-office/domain/types";
import { MAX_REVIEW_BODY_BYTES, REVIEW_ERROR_REMEDIATION } from "@agent-office/domain/config/review";
import { parseJson, prNumberSchema } from "@agent-office/api-contract";
import { badRequest, notFound, readBoundedText, validateIdParam } from "./api-helpers";

export type ProjectParams = { params: Promise<{ id: string }> };
export type PullParams = { params: Promise<{ id: string; number: string }> };

type Found<T> = ({ error: null } & T) | { error: Response };

/** Every review call runs gh. A browser marks a request another site made (an `<img>`
 *  pointing here); refuse those even for GET. Non-browser clients send no such header. */
function crossSite(request: Request): Response | null {
  const site = request.headers.get("sec-fetch-site");
  return site && site !== "same-origin" && site !== "none"
    ? Response.json({ error: "forbidden" }, { status: 403 })
    : null;
}

export async function reviewProject(request: Request, { params }: ProjectParams): Promise<Found<{ project: Project }>> {
  const denied = crossSite(request);
  if (denied) return { error: denied };
  const id = validateIdParam((await params).id);
  if (id.error) return { error: id.error };
  const project = projects.readProject(id.value);
  return project ? { project, error: null } : { error: notFound() };
}

export async function reviewPull(request: Request, ctx: PullParams): Promise<Found<{ project: Project; number: number }>> {
  const p = await reviewProject(request, ctx);
  if (p.error) return p;
  const n = prNumberSchema.safeParse((await ctx.params).number);
  return n.success ? { project: p.project, number: n.data, error: null } : { error: badRequest("invalid_pr_number") };
}

/** The JSON body, capped: a review is at most MAX_REVIEW_COMMENTS × MAX_REVIEW_TEXT. */
export async function reviewBody(request: Request): Promise<{ raw: unknown; error: null } | { error: Response }> {
  const { text, error } = await readBoundedText(request, MAX_REVIEW_BODY_BYTES);
  if (error) return { error };
  try {
    return { raw: parseJson(text ?? ""), error: null };
  } catch {
    return { error: badRequest("invalid_json") };
  }
}

export function reviewResponse<T>(r: review.ReviewResult<T>): Response {
  if (r.ok) return Response.json(r.value);
  // `hint`: the code's remediation, so a client (the Minecraft mod) can show the fix without a copy of the table.
  return Response.json({ error: r.error, hint: REVIEW_ERROR_REMEDIATION[r.error], ...(r.detail ? { detail: r.detail } : {}) }, { status: r.status });
}
