import { NextResponse } from "next/server";
import { store } from "@agent-office/domain/services";
import { notFound } from "@/lib/api-helpers";

type Params = { params: Promise<{ id: string }> };

export async function DELETE(_request: Request, { params }: Params) {
  const { id } = await params;
  const existing = store.getWorkflow(id);
  if (!existing) return notFound();
  store.deleteWorkflow(id);
  return new NextResponse(null, { status: 204 });
}
