// GET /api/missions/seat?instanceId= — which mission seat a chat is (local only), for the chat header pill.
import { missions } from "@agent-office/domain/services";
import { badRequest, validateIdParam } from "../../../lib/api-helpers";

export async function GET(request: Request) {
  const raw = new URL(request.url).searchParams.get("instanceId");
  if (!raw) return badRequest("instance_required");
  const id = validateIdParam(raw);
  if (id.error) return id.error;
  return Response.json({ seat: missions.seatForInstance(id.value) });
}
