import { NextResponse } from "next/server";
import { cleanup } from "@agent-office/domain/services";
import { badRequest } from "@/lib/api-helpers";

type Params = { params: Promise<{ kind: string }> };

function isCleanupKind(v: string): v is cleanup.CleanupKind {
  return (cleanup.CLEANUP_KINDS as readonly string[]).includes(v);
}

export async function POST(_request: Request, { params }: Params) {
  const { kind } = await params;
  if (!isCleanupKind(kind)) return badRequest(`unknown cleanup kind: ${kind}`);
  const result = cleanup.runCleanup(kind);
  return NextResponse.json(result);
}
