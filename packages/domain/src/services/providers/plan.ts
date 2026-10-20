// The plan badge for the provider in force. A subscription's comes from the CLI's own
// `auth status`; a failed read is `unknown`, never "free".

import type { ClaudePlan, Provider } from "../../types/index";
import { currentProvider } from "./current";
import { authStatus } from "./status-cache";

export type AccountPlan = ClaudePlan | "unknown";

const PLAN_TTL_MS = 5 * 60_000;
let cached: { plan: AccountPlan; provider: Provider | null; at: number } | null = null;

/** After a sign-in the badge must not wait out the cache. */
export function forgetAccountPlan(): void {
  cached = null;
}

export function planFromSubscriptionType(raw: unknown): AccountPlan {
  if (typeof raw !== "string") return "unknown";
  const sub = raw.toLowerCase();
  if (sub.startsWith("max")) return "max";
  if (sub === "pro" || sub === "free") return sub;
  if (sub === "team" || sub === "enterprise") return "custom";
  return "unknown";
}

export async function accountPlan(now = Date.now()): Promise<{ plan: AccountPlan; provider: Provider | null }> {
  const provider = currentProvider().provider;
  if (cached && cached.provider === provider && now - cached.at < PLAN_TTL_MS) return cached;
  let plan: AccountPlan = "unknown";
  if (provider === "anthropic_api" || provider === "openai") plan = "api";
  else if (provider === "local") plan = "custom";
  else if (provider === "subscription") {
    const status = await authStatus();
    if (status && typeof status === "object" && "loggedIn" in status && status.loggedIn === true) {
      plan = planFromSubscriptionType("subscriptionType" in status ? status.subscriptionType : undefined);
    }
  }
  // An unreadable plan is retried on the next read, never remembered.
  if (plan !== "unknown") cached = { plan, provider, at: now };
  return { plan, provider };
}
