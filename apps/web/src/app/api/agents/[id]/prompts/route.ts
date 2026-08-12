import { NextResponse } from "next/server";
import { store } from "@agent-office/domain/services";
import { validateBody } from "@/lib/validation";
import { promptPostSchema } from "@/lib/validation-schemas";
import { validateIdParam } from "@/lib/api-helpers";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  const { value: id, error } = validateIdParam((await params).id);
  if (error) return error;
  return NextResponse.json(store.getRecentPrompts(id));
}

export async function POST(request: Request, { params }: Params) {
  const { value: id, error: paramError } = validateIdParam((await params).id);
  if (paramError) return paramError;
  const raw: unknown = await request.json();
  const { data, error } = validateBody(promptPostSchema, raw);
  if (error) return error;
  store.pushRecentPrompt(id, data.prompt);
  return NextResponse.json({ ok: true });
}
