// GET /api/account — the active Claude plan, read from ~/.claude/.credentials.json,
// so the UI can render the correct billing/limits badges. Cached 5m to avoid
// re-reading the file on every poll.
import { NextResponse } from "next/server";
import { readFileSync } from "fs";
import { homedir } from "os";
import { join } from "path";
import { match } from "ts-pattern";
import { z } from "zod";
import type { ClaudePlan } from "@/lib/claude-limits-store";

// Only the one field we read — the file is external, so validate rather than cast.
const credentialsSchema = z.object({
  claudeAiOauth: z.object({ subscriptionType: z.string().optional() }).optional(),
});

// Local to this cache by design: a TTL is an implementation detail of the thing
// it caches, not a shared constant. Other caches (e.g. server-process-store) keep
// their own. Promote only when a second reader actually needs this exact value.
const PLAN_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
let planCache: { plan: ClaudePlan; expiresAt: number } | null = null;

function readPlan(): ClaudePlan {
  const now = Date.now();
  if (planCache && now < planCache.expiresAt) return planCache.plan;

  let sub = "";
  try {
    const raw = readFileSync(join(homedir(), ".claude", ".credentials.json"), "utf-8");
    const creds = credentialsSchema.safeParse(JSON.parse(raw));
    if (creds.success) sub = (creds.data.claudeAiOauth?.subscriptionType ?? "").toLowerCase();
  } catch {
    // file missing or unreadable — leave sub empty so we fall through to "free"
  }

  const plan = match(sub)
    .when((s) => s.startsWith("max"), (): ClaudePlan => "max")
    .with("pro", (): ClaudePlan => "pro")
    .with("api", "api_key", (): ClaudePlan => "api")
    .otherwise((): ClaudePlan => "free");

  planCache = { plan, expiresAt: now + PLAN_CACHE_TTL_MS };
  return plan;
}

export async function GET() {
  return NextResponse.json({ plan: readPlan() });
}
