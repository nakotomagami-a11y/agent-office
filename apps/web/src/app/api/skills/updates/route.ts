import { NextResponse } from "next/server";
import { skills } from "@agent-office/domain/services";
import { log } from "@agent-office/domain/services/log";
import { serverError } from "@/lib/api-helpers";

export async function GET() {
  try {
    return NextResponse.json(await skills.checkForUpdates());
  } catch (e) {
    log.warn("skills.updates_failed", { err: String(e) });
    return serverError("skill_updates_failed");
  }
}
