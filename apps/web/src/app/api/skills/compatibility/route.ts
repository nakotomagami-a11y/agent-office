import { NextResponse } from "next/server";
import { skills } from "@agent-office/domain/services";
import { log } from "@agent-office/domain/services/log";
import { serverError } from "@/lib/api-helpers";

export async function GET() {
  try {
    const compat = skills.readCompatibility();
    if (!compat) {
      return NextResponse.json({}, { status: 200 });
    }
    return NextResponse.json(compat);
  } catch (e) {
    log.warn("skills.compatibility_failed", { err: String(e) });
    return serverError("skill_compatibility_failed");
  }
}
