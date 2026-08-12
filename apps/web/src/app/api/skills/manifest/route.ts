import { NextResponse } from "next/server";
import { skills } from "@agent-office/domain/services";
import { log } from "@agent-office/domain/services/log";
import { serverError } from "@/lib/api-helpers";

export async function GET() {
  try {
    const manifest = skills.readManifest();
    if (!manifest) {
      return NextResponse.json({ skills: [] }, { status: 200 });
    }
    return NextResponse.json(manifest);
  } catch (e) {
    log.warn("skills.manifest_failed", { err: String(e) });
    return serverError("skill_manifest_failed");
  }
}
