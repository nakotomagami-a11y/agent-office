import type { PersistedRun } from "@agent-office/domain/types";
import { isoDay, todayIso } from "../format/activity-formatters";

export interface LeaderboardRow {
  agentId: string;
  agentName: string;
  runs: number;
  cost: number;
  tokens: number;
}

/** Ranks agents by today's run count — always "today", independent of the
 * page's scope selector, matching the mockup's "Top of the day" panel. */
export function buildLeaderboard(runs: PersistedRun[], limit = 3): LeaderboardRow[] {
  const today = todayIso();
  const byAgent = new Map<string, LeaderboardRow>();
  for (const r of runs) {
    if (isoDay(r.ts) !== today) continue;
    const row = byAgent.get(r.agentId) ?? { agentId: r.agentId, agentName: r.agentName, runs: 0, cost: 0, tokens: 0 };
    row.runs += 1;
    row.cost += r.cost;
    row.tokens += r.tokensIn + r.tokensOut;
    byAgent.set(r.agentId, row);
  }
  return Array.from(byAgent.values())
    .sort((a, b) => b.runs - a.runs)
    .slice(0, limit);
}
