import { NextResponse } from "next/server";
import { skills } from "@agent-office/domain/services";
import { log } from "@agent-office/domain/services/log";
import { serverError } from "@/lib/api-helpers";
import { validateQuery } from "@/lib/validation";
import { skillsRegistryQuerySchema } from "@/lib/validation-schemas";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const { data: q, error } = validateQuery(skillsRegistryQuerySchema, url.searchParams);
  if (error) return error;
  try {
    const entries = await skills.fetchRegistry(q.refresh);
    return NextResponse.json(entries);
  } catch (e) {
    log.warn("skills.registry_failed", { err: String(e) });
    return serverError("skill_registry_failed");
  }
}
