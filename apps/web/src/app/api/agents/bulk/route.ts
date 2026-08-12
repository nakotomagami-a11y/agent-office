import { NextResponse } from "next/server";
import { agents } from "@agent-office/domain/services";
import { validateBody } from "@/lib/validation";
import { agentBodyListSchema } from "@/lib/validation-schemas";

export async function POST(request: Request) {
  const raw: unknown = await request.json();
  const { data: items, error } = validateBody(agentBodyListSchema, raw);
  if (error) return error;
  const written: string[] = [];
  const errors: Array<{ id: string; error: string }> = [];
  for (const item of items) {
    try {
      written.push(agents.writeAgent(item));
    } catch (e) {
      errors.push({ id: item.id, error: String(e) });
    }
  }
  const status = written.length === 0 && errors.length > 0 ? 500
               : errors.length > 0 ? 207
               : 200;
  return NextResponse.json({ written, errors }, { status });
}
