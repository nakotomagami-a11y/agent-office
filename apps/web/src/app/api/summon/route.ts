import { NextResponse } from "next/server";
import { summonRun } from "@agent-office/domain/services";
import { validateBody } from "@/lib/validation";
import { summonRequestSchema } from "@/lib/validation-schemas";
import { badRequest, serverError } from "@/lib/api-helpers";
import { log } from "@agent-office/domain/services/log";

export async function POST(request: Request) {
  try {
    return await handleSummon(request);
  } catch (e) {
    // Without this the throw becomes Next's bodyless 500, which the client
    // renders as the useless "Internal Server Error" and leaves no trace on
    // disk. Surface the real message and record it.
    const err = e instanceof Error ? e : new Error(String(e));
    log.error("summon.failed", { message: err.message, stack: err.stack });
    return serverError(err.message);
  }
}

async function handleSummon(request: Request) {
  const raw: unknown = await request.json();
  const { data: req, error } = validateBody(summonRequestSchema, raw);
  if (error) return error;

  const result = await summonRun.startSummonRun(req);
  if ("error" in result) {
    if (result.error.code) {
      return NextResponse.json({ error: result.error.code, detail: result.error.message }, { status: result.error.status });
    }
    return badRequest(result.error.message);
  }
  return NextResponse.json({ runId: result.runId });
}
