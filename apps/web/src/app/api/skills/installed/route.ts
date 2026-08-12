import { NextResponse } from "next/server";
import { skills } from "@agent-office/domain/services";
import { log } from "@agent-office/domain/services/log";
import { serverError } from "@/lib/api-helpers";

export async function GET() {
  try {
    return NextResponse.json(skills.listInstalled());
  } catch (e) {
    log.warn("skills.installed_failed", { err: String(e) });
    return serverError("skill_list_failed");
  }
}
