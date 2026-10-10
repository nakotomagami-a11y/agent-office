import { projects } from "@agent-office/domain/services";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { extname, join } from "node:path";
import { Buffer } from "node:buffer";
import { MAX_UPLOAD_BYTES, safeFilename, isValidIdSegment } from "@agent-office/domain/services/infra/paths";
import { writeFileAtomic } from "@agent-office/domain/services/infra/fs-atomic";
import { readSettings, isIntegrationEnabled } from "@agent-office/domain/services/settings";
import { log } from "@agent-office/domain/services/infra/log";

export function notFound(message = "not_found"): Response {
  return Response.json({ error: message }, { status: 404 });
}

// Dev-only route guard: 404 in production so dev tooling never ships. Returns the
// response to short-circuit with, or null to continue.
export function forbidInProd(): Response | null {
  return process.env.NODE_ENV === "production" ? notFound() : null;
}

// Gate a route on an integration toggle (see the integration registry). Returns a
// 404 when the integration is off — call it at the top of every route that belongs
// to an optional integration so disabled ones behave as if they don't exist.
export function requireIntegration(id: string): Response | null {
  if (isIntegrationEnabled(readSettings(), id)) return null;
  return Response.json({ error: "integration_disabled", integration: id }, { status: 404 });
}

export function badRequest(message = "bad_request"): Response {
  return Response.json({ error: message }, { status: 400 });
}

export function serverError(message = "internal_error"): Response {
  return Response.json({ error: message }, { status: 500 });
}

/** 409 — the caller's copy is stale; it must re-read before writing again. */
export function conflict(message = "conflict", extra?: Record<string, unknown>): Response {
  return Response.json({ error: message, ...extra }, { status: 409 });
}

export function payloadTooLarge(maxBytes: number): Response {
  return Response.json(
    { error: "payload_too_large", maxBytes },
    { status: 413 },
  );
}

export type ParamResult = { value: string; error: null } | { value: null; error: Response };
export type TextResult = { text: string; error: null } | { text: null; error: Response };

// Validate a route :id / :name segment before it reaches the filesystem.
// Returns either the value (safe to use) or a 400 response.
export function validateIdParam(raw: string): ParamResult {
  if (!isValidIdSegment(raw)) {
    return { value: null, error: badRequest("invalid_id") };
  }
  return { value: raw, error: null };
}

// Read a text body with a hard byte cap. Streams in chunks so we don't pull
// a multi-GB body into memory before checking the size.
export async function readBoundedText(request: Request, maxBytes: number): Promise<TextResult> {
  const reader = request.body?.getReader();
  if (!reader) {
    const text = await request.text();
    if (Buffer.byteLength(text, "utf8") > maxBytes) {
      return { text: null, error: payloadTooLarge(maxBytes) };
    }
    return { text, error: null };
  }
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    if (value) {
      total += value.byteLength;
      if (total > maxBytes) {
        try {
          await reader.cancel();
        } catch {
          /* best-effort */
        }
        return { text: null, error: payloadTooLarge(maxBytes) };
      }
      chunks.push(value);
    }
  }
  return { text: Buffer.concat(chunks).toString("utf8"), error: null };
}

// Map service exceptions to typed error responses. ENOENT / "not found"
// → 404, anything else → 500 (was 400 - that masked real internal errors).
export async function tryService<T>(fn: () => Promise<T> | T): Promise<Response> {
  try {
    const result = await fn();
    return Response.json(result);
  } catch (e) {
    const err = e instanceof Error ? e : new Error(String(e));
    const msg = err.message;
    // Before the /not found/ sniff, which would 404 these. Narrow on `code`
    // too: a module instantiated twice in the server graph fails instanceof.
    const code = (err as { code?: string }).code;
    if (err instanceof projects.StaleProjectWriteError || code === "stale_write") {
      const e = err as Partial<projects.StaleProjectWriteError>;
      return conflict("stale_write", { detail: msg, expectedRev: e.expectedRev, actualRev: e.actualRev });
    }
    if (err instanceof projects.UnreadableProjectMetadataError || code === "metadata_unreadable") {
      return conflict("metadata_unreadable", { detail: msg });
    }
    if (
      (err as NodeJS.ErrnoException).code === "ENOENT" ||
      /not found/i.test(msg) ||
      /^invalid/i.test(msg)
    ) {
      return notFound(msg);
    }
    log.error("route.failed", { message: msg, stack: err.stack });
    return serverError(msg);
  }
}

export function listDirUploads(dir: string): Array<{ filename: string; path: string; size: number }> {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .map((f) => {
      const p = join(dir, f);
      return { filename: f, path: p, size: statSync(p).size };
    })
    .sort((a, b) => a.filename.localeCompare(b.filename));
}

export async function handleUpload(request: Request, dir: string): Promise<Response> {
  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return badRequest("missing_file");
  if (file.size > MAX_UPLOAD_BYTES) return payloadTooLarge(MAX_UPLOAD_BYTES);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const filename = safeFilename(file.name);
  const path = join(dir, filename);
  const buf = await file.arrayBuffer();
  writeFileAtomic(path, Buffer.from(buf));
  return Response.json({ filename, path, size: file.size });
}

const IMAGE_MIME: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".bmp": "image/bmp",
  ".ico": "image/x-icon",
};

export function handleServeUpload(dir: string, filename: string): Response {
  const safe = safeFilename(filename);
  const filePath = join(dir, safe);
  if (!existsSync(filePath)) return new Response("Not found", { status: 404 });
  try {
    const data = readFileSync(filePath);
    const ext = extname(filePath).toLowerCase();
    const contentType = IMAGE_MIME[ext] ?? "application/octet-stream";
    return new Response(data, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "private, max-age=86400",
      },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}

export function handleDeleteUpload(dir: string, filename: string): Response {
  const safe = safeFilename(filename);
  const path = join(dir, safe);
  if (!existsSync(path)) return notFound();
  rmSync(path);
  return Response.json({ deleted: safe });
}
