// POST /api/secrets/test — run an unsaved form's test command with its value in env.
// A blank value with `id` uses that secret's stored value. Nothing is persisted.
import { secrets, paths } from "@agent-office/domain/services";
import { validateBody } from "../../../lib/validation";
import { secretDraftTestSchema } from "@agent-office/api-contract";
import { badRequest, notFound } from "../../../lib/api-helpers";

export async function POST(request: Request) {
  const raw: unknown = await request.json();
  const { data, error } = validateBody(secretDraftTestSchema, raw);
  if (error) return error;
  if (data.id && !paths.isValidIdSegment(data.id)) return badRequest("invalid_id");
  if (!data.value && !data.id) return badRequest("value_required");
  if (!secrets.isDraftTestNameAllowed(data.name)) return badRequest("reserved_name");
  const result = await secrets.testDraft(data);
  if (!result) return notFound();
  return Response.json(result);
}
