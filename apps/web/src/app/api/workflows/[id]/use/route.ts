import { NextResponse } from "next/server";
import { store } from "@agent-office/domain/services";

type Params = { params: Promise<{ id: string }> };

export async function POST(_request: Request, { params }: Params) {
  const { id } = await params;
  store.recordWorkflowUsage(id);
  return new NextResponse(null, { status: 204 });
}
