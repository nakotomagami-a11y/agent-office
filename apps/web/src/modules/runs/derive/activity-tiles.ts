import type { PersistedRun } from "@agent-office/domain/types";
import {
  fmtTok,
  isoDay,
  todayIso,
  yesterdayIso,
  formatDelta,
  type Delta,
} from "../format/activity-formatters";
import { formatCost, formatDuration } from "../format/format-run-meta";
import { buildSparkData, buildSuccessSpark } from "../format/activity-stats";

/** Artistic per-tile icon (real illustration, no icon-font/badge). */
export type StatTileIcon = { src: string; alt: string };

export interface StatTile {
  label: string;
  value: string | number;
  unit: string;
  delta: Delta;
  spark: number[];
  color: string;
  icon: StatTileIcon;
}

interface DayStats {
  count: number;
  cost: number;
  tokens: number;
  success: number;
  durMs: number;
}

function dayStats(runs: PersistedRun[], day: string): DayStats {
  const dayRuns = runs.filter((r) => isoDay(r.ts) === day);
  const count = dayRuns.length;
  const settled = dayRuns.filter((r) => r.status !== "running");
  const ok = settled.filter((r) => r.status === "done").length;
  return {
    count,
    cost: dayRuns.reduce((s, r) => s + r.cost, 0),
    tokens: dayRuns.reduce((s, r) => s + r.tokensIn + r.tokensOut, 0),
    success: settled.length === 0 ? 100 : Math.round((100 * ok) / settled.length),
    durMs: dayRuns.reduce((s, r) => s + r.durMs, 0),
  };
}

// V3 relabels the stat rail as "mana/gold/win-rate/time-in-field" — a
// presentational skin over the same real metrics (tokens/cost/success/
// duration), no new schema or persisted XP economy. See REDESIGN_V3_PLAN §D4.
export function buildStatTiles(runs: PersistedRun[]): StatTile[] {
  const t = dayStats(runs, todayIso());
  const y = dayStats(runs, yesterdayIso());
  return [
    {
      label: "Mana spent",
      value: fmtTok(t.tokens),
      unit: "tok",
      delta: formatDelta(t.tokens, y.tokens),
      spark: buildSparkData(runs, (r) => r.tokensIn + r.tokensOut),
      color: "var(--cyan)",
      icon: { src: "/icons/mana.png", alt: "" },
    },
    {
      label: "Gold spent",
      value: formatCost(t.cost),
      unit: "USD",
      delta: formatDelta(t.cost, y.cost),
      spark: buildSparkData(runs, (r) => r.cost),
      color: "var(--amber)",
      icon: { src: "/icons/coin.png", alt: "" },
    },
    {
      label: "Win rate",
      value: `${t.success}%`,
      unit: "",
      delta: formatDelta(t.success, y.success),
      spark: buildSuccessSpark(runs),
      color: "var(--green)",
      icon: { src: "/icons/trophy.png", alt: "" },
    },
    {
      label: "Time in field",
      value: formatDuration(t.durMs),
      unit: "",
      delta: formatDelta(t.durMs, y.durMs),
      spark: buildSparkData(runs, (r) => r.durMs),
      color: "var(--acc)",
      icon: { src: "/icons/clock.png", alt: "" },
    },
  ];
}
