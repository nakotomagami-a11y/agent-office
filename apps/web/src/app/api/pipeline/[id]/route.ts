import { NextResponse } from "next/server";
import { pipeline } from "@agent-office/domain/services";
import { notFound, validateIdParam } from "@/lib/api-helpers";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  const { id: rawId } = await params;
  const { value: id, error: paramError } = validateIdParam(rawId);
  if (paramError) return paramError;

  const run = pipeline.getPipeline(id);
  if (!run) return notFound();

  return NextResponse.json(run);
}
