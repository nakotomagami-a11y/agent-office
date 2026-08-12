import { NextResponse } from "next/server";
import { runs } from "@agent-office/domain/services";
import { notFound, validateIdParam } from "@/lib/api-helpers";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  const { value: id, error } = validateIdParam((await params).id);
  if (error) return error;
  const tree = runs.buildRunTree(id);
  if (!tree) return notFound("run");
  return NextResponse.json(tree);
}
