import { NextResponse } from "next/server";
import { store } from "@agent-office/domain/services";
import { validateIdParam } from "@/lib/api-helpers";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  const { value: id, error } = validateIdParam((await params).id);
  if (error) return error;
  const children = store.getChildRuns(id);
  return NextResponse.json(children);
}
