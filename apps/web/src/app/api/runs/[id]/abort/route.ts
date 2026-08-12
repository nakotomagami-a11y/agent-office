import { NextResponse } from "next/server";
import { runs } from "@agent-office/domain/services";
import { validateIdParam } from "@/lib/api-helpers";

type Params = { params: Promise<{ id: string }> };

export async function POST(_request: Request, { params }: Params) {
  const { value: id, error } = validateIdParam((await params).id);
  if (error) return error;
  const ok = runs.abortRun(id);
  return NextResponse.json({ aborted: ok });
}
