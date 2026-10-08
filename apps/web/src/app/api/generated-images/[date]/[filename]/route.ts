// GET /api/generated-images/<YYYY-MM-DD>/<filename> — serve one image the `imggen`
// CLI wrote under ~/Documents/Generated Images. Read-only; raster formats only.
import { existsSync, realpathSync, statSync } from "node:fs";
import { join, sep } from "node:path";
import { GENERATED_IMAGE_DATE, GENERATED_IMAGE_EXT, MAX_GENERATED_IMAGE_BYTES } from "@agent-office/domain/config/generated-images";
import { GENERATED_IMAGES_DIR } from "@agent-office/domain/services/infra/paths";
import { badRequest, handleServeUpload, notFound, validateIdParam } from "@/lib/api-helpers";

type Params = { params: Promise<{ date: string; filename: string }> };

/** Null when the file vanished after the existence check. */
function tryRealpath(path: string): string | null {
  try {
    return realpathSync(path);
  } catch {
    return null;
  }
}

export async function GET(_request: Request, { params }: Params) {
  const { date, filename } = await params;
  if (!GENERATED_IMAGE_DATE.test(date)) return badRequest("invalid_date");
  const nameCheck = validateIdParam(filename);
  if (nameCheck.error) return nameCheck.error;
  if (!GENERATED_IMAGE_EXT.test(nameCheck.value)) return badRequest("invalid_filename");

  const dir = join(GENERATED_IMAGES_DIR, date);
  const file = join(dir, nameCheck.value);
  // A symlink dropped in the folder must not serve a file from outside it.
  const real = existsSync(file) ? tryRealpath(file) : null;
  if (!real?.startsWith(realpathSync(GENERATED_IMAGES_DIR) + sep)) return notFound();
  // The serve is a blocking read: a FIFO would hang the server, a huge file exhaust it.
  const st = statSync(file, { throwIfNoEntry: false });
  if (!st?.isFile() || st.size > MAX_GENERATED_IMAGE_BYTES) return notFound();
  return handleServeUpload(dir, nameCheck.value);
}
