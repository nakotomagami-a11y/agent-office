import { NextResponse } from "next/server";
import { health } from "@agent-office/domain/services";
import { validateQuery } from "@/lib/validation";
import { healthQuerySchema } from "@/lib/validation-schemas";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const { data: q, error } = validateQuery(healthQuerySchema, url.searchParams);
  if (error) return error;
  return NextResponse.json(await health.getHealth(q.force));
}
