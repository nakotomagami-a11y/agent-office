import { NextResponse } from "next/server";
import { db as dbService } from "@agent-office/domain/services";
import { validateIdParam } from "@/lib/api-helpers";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  const { value: id, error } = validateIdParam((await params).id);
  if (error) return error;

  const byInstance = dbService.getSpendByInstanceForProject(id);
  const total = Object.values(byInstance).reduce((sum, v) => sum + v, 0);

  return NextResponse.json({ byInstance, total });
}
