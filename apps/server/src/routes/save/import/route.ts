// POST /api/save/import — restore a previously exported bundle (validated).
import { save } from "@agent-office/domain/services";
import { isValidIdSegment } from "@agent-office/domain/services/infra/paths";
import { validateBody } from "../../../lib/validation";
import { saveFileSchema } from "@agent-office/api-contract";
import { readBoundedText, badRequest, serverError } from "../../../lib/api-helpers";

const IMPORT_MAX_BYTES = 20 * 1024 * 1024; // 20 MB

export async function POST(request: Request) {
  const { text, error: bodyErr } = await readBoundedText(request, IMPORT_MAX_BYTES);
  if (bodyErr) return bodyErr;

  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return badRequest("invalid_json");
  }

  const { data, error } = validateBody(saveFileSchema, raw);
  if (error) return badRequest("invalid_save_file");
  if (!isValidIdSegment(data.project.id)) return badRequest("invalid_project_id");

  try {
    const { agentCount } = save.importBundle(data);
    return Response.json({ ok: true, agentCount });
  } catch (e) {
    return serverError(String(e instanceof Error ? e.message : e));
  }
}
