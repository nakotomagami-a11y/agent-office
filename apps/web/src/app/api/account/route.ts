import { NextResponse } from "next/server";
import { readFileSync } from "fs";
import { homedir } from "os";
import { join } from "path";
import type { ClaudePlan } from "@/lib/claude-limits-store";

const PLAN_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
let _planCache: { plan: ClaudePlan; expiresAt: number } | null = null;

function readPlan(): ClaudePlan {
  const now = Date.now();
  if (_planCache && now < _planCache.expiresAt) return _planCache.plan;

  let plan: ClaudePlan = "free";
  try {
    const raw = readFileSync(join(homedir(), ".claude", ".credentials.json"), "utf-8");
    const creds = JSON.parse(raw) as Record<string, unknown>;
    const oauth = creds.claudeAiOauth as Record<string, unknown> | undefined;
    const sub = typeof oauth?.subscriptionType === "string" ? oauth.subscriptionType.toLowerCase() : "";
    if (sub === "max" || sub.startsWith("max")) plan = "max";
    else if (sub === "pro") plan = "pro";
    else if (sub === "free") plan = "free";
    else if (sub === "api" || sub === "api_key") plan = "api";
  } catch {
    // file missing or unreadable — keep "free"
  }

  _planCache = { plan, expiresAt: now + PLAN_CACHE_TTL_MS };
  return plan;
}

export async function GET() {
  return NextResponse.json({ plan: readPlan() });
}
