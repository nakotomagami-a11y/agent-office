// Shared steps of the /api/missions/* routes (docs/missions.md).
import type { missions } from "@agent-office/domain/services";
import { MISSION_ACTION_REMEDIATION, isMissionActionError } from "@agent-office/domain/config/missions";
import { REVIEW_ERROR_REMEDIATION } from "@agent-office/domain/config/review";
import { commentIdSchema, missionIdSchema, parseJson } from "@agent-office/api-contract";
import { badRequest, readBoundedText, refuseCrossSite } from "./api-helpers";

export type MissionParams = { params: Promise<{ id: string }> };
export type MissionCommentParams = { params: Promise<{ id: string; commentId: string }> };

type Found<T> = ({ error: null } & T) | { error: Response };

const MAX_BODY_BYTES = 64 * 1024;

/** Every mission route but the local seat lookup runs gh or git. */
export async function missionId(request: Request, { params }: MissionParams): Promise<Found<{ missionId: string }>> {
  const denied = refuseCrossSite(request);
  if (denied) return { error: denied };
  const id = missionIdSchema.safeParse((await params).id);
  return id.success ? { missionId: id.data, error: null } : { error: badRequest("invalid_mission_id") };
}

export async function missionComment(request: Request, ctx: MissionCommentParams): Promise<Found<{ missionId: string; commentId: number }>> {
  const m = await missionId(request, ctx);
  if (m.error) return m;
  const c = commentIdSchema.safeParse((await ctx.params).commentId);
  return c.success ? { missionId: m.missionId, commentId: c.data, error: null } : { error: badRequest("invalid_comment_id") };
}

export async function missionBody(request: Request): Promise<{ raw: unknown; error: null } | { error: Response }> {
  const denied = refuseCrossSite(request);
  if (denied) return { error: denied };
  const { text, error } = await readBoundedText(request, MAX_BODY_BYTES);
  if (error) return { error };
  try {
    return { raw: parseJson(text ?? ""), error: null };
  } catch {
    return { error: badRequest("invalid_json") };
  }
}

export function missionResponse<T>(r: missions.MissionResult<T>): Response {
  if (r.ok) return Response.json(r.value ?? { ok: true });
  // `hint`: the code's remediation, so any client can show the fix without a copy of the table.
  const hint = isMissionActionError(r.error) ? MISSION_ACTION_REMEDIATION[r.error] : REVIEW_ERROR_REMEDIATION[r.error];
  return Response.json({ error: r.error, hint, ...(r.detail ? { detail: r.detail } : {}) }, { status: r.status });
}
