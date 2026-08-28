import type { PersistedRun } from "@agent-office/domain/types";
import { isoDay, todayIso, xpForRun } from "../format/activity-formatters";

export interface HaulStats {
  runsToday: number;
  xpToday: number;
  streakDays: number;
  dailyGoal: number;
  level: number;
  runsToNextLevel: number;
}

const RUNS_PER_LEVEL = 20;

/**
 * "Today's haul" gamification panel — every number here is derived live from
 * real run history (no persisted XP/streak/level state). See §D4: relabel,
 * don't invent an economy.
 */
export function buildHaulStats(runs: PersistedRun[]): HaulStats {
  const today = todayIso();
  const todayRuns = runs.filter((r) => isoDay(r.ts) === today);
  const runsToday = todayRuns.length;
  const xpToday = todayRuns.reduce((s, r) => s + xpForRun(r), 0);

  // Consecutive days with at least one run, walking back from today.
  const daysWithRuns = new Set(runs.map((r) => isoDay(r.ts)));
  let streakDays = 0;
  for (let i = 0; ; i++) {
    const day = isoDay(Date.now() - i * 86_400_000);
    if (!daysWithRuns.has(day)) {
      if (i === 0) continue; // today may have zero runs yet — don't break the streak on that alone
      break;
    }
    streakDays++;
  }

  // Goal = 7-day rolling average run count, nudged up ~20%, floored at 10.
  const last7 = Array.from({ length: 7 }, (_, i) => isoDay(Date.now() - i * 86_400_000));
  const last7Count = runs.filter((r) => last7.includes(isoDay(r.ts))).length;
  const dailyGoal = Math.max(10, Math.round((last7Count / 7) * 1.2));

  const totalRuns = runs.length;
  const level = Math.floor(totalRuns / RUNS_PER_LEVEL) + 1;
  const runsToNextLevel = RUNS_PER_LEVEL - (totalRuns % RUNS_PER_LEVEL);

  return { runsToday, xpToday, streakDays, dailyGoal, level, runsToNextLevel };
}
