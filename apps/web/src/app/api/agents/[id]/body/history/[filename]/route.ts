import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { AGENTS_DIR } from "@agent-office/domain/services/paths";
import { notFound, validateIdParam, badRequest } from "@/lib/api-helpers";

type Params = { params: Promise<{ id: string; filename: string }> };

export async function GET(_request: Request, { params }: Params) {
  const { id: rawId, filename: rawFilename } = await params;

  const { value: id, error: idError } = validateIdParam(rawId);
  if (idError) return idError;

  // Validate filename: must match pattern <id>.body.<...>.md and be a safe segment
  // Allow dots in filename (it has multiple), so we do a specific check
  const decoded = decodeURIComponent(rawFilename);
  const prefix = `${id}.body.`;
  if (
    !decoded.startsWith(prefix) ||
    !decoded.endsWith(".md") ||
    decoded.includes("/") ||
    decoded.includes("\\") ||
    decoded.includes("..")
  ) {
    return badRequest("invalid_id");
  }

  // Extra safety: check no path traversal in any segment
  const inner = decoded.slice(prefix.length, -".md".length);
  if (!inner || inner.includes("/") || inner.includes("\\")) {
    return badRequest("invalid_id");
  }

  const filePath = join(AGENTS_DIR, decoded);
  if (!existsSync(filePath)) return notFound();

  const content = readFileSync(filePath, "utf8");
  return new Response(content, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
