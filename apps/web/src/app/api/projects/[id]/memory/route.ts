import { NextResponse } from "next/server";
import { projects } from "@agent-office/domain/services";
import { MAX_MEMORY_BYTES } from "@agent-office/domain/services/paths";
import { notFound, readBoundedText, serverError, validateIdParam } from "@/lib/api-helpers";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  const { value: id, error } = validateIdParam((await params).id);
  if (error) return error;
  const p = projects.readProject(id);
  if (!p) return notFound();
  return new Response(p.memory, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
}

export async function PUT(request: Request, { params }: Params) {
  const { value: id, error: paramError } = validateIdParam((await params).id);
  if (paramError) return paramError;
  const { text, error } = await readBoundedText(request, MAX_MEMORY_BYTES);
  if (error) return error;
  try {
    projects.updateProject(id, { memory: text });
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return /not found/i.test(msg) ? notFound(msg) : serverError(msg);
  }
}
