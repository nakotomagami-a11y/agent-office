/**
 * API module for the local Claude account — reads the subscription plan from
 * `~/.claude/.credentials.json` via `/api/account`.
 */

import { API_ROUTES } from "@agent-office/domain/config/routes";
import { apiClient } from "@/lib/api-client";
import type { ClaudePlan } from "@/lib/claude-limits-store";

export interface Account {
  plan: ClaudePlan;
}

export async function getAccount(): Promise<Account> {
  const res = await apiClient.get<Account>(API_ROUTES.account);
  return res.data;
}
