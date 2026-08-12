import type { PersistedRun } from "@agent-office/domain/types";
import {
  fmtTok,
  isoDay,
  todayIso,
  yesterdayIso,
  formatDelta,
  type Delta,
} from "../format/activity-formatters";
import { formatCost } from "../format/format-run-meta";
import { buildSparkData, buildSuccessSpark } from "../format/activity-stats";

export interface StatTile {
  label: string;
  value: string | number;
  unit: string;
  delta: Delta;
  spark: number[];
  color: string;
}

interface DayStats {
  count: number;
  cost: number;
  tokens: number;
  success: number;
}

function dayStats(runs: PersistedRun[], day: string): DayStats {
  const dayRuns = runs.filter((r) => isoDay(r.ts) === day);
  const count = dayRuns.length;
  const ok = dayRuns.filter((r) => r.status === "done").length;
  return {
    count,
    cost: dayRuns.reduce((s, r) => s + r.cost, 0),
    tokens: dayRuns.reduce((s, r) => s + r.tokensIn + r.tokensOut, 0),
    success: count === 0 ? 100 : Math.round((100 * ok) / count),
  };
}

export function buildStatTiles(runs: PersistedRun[]): StatTile[] {
  const t = dayStats(runs, todayIso());
  const y = dayStats(runs, yesterdayIso());
  return [
    {
      label: "Runs today",
      value: t.count,
      unit: "runs",
      delta: formatDelta(t.count, y.count),
      spark: buildSparkData(runs, () => 1),
      color: "#E95420",
    },
    {
      label: "Tokens used",
      value: fmtTok(t.tokens),
      unit: "tok",
      delta: formatDelta(t.tokens, y.tokens),
      spark: buildSparkData(runs, (r) => r.tokensIn + r.tokensOut),
      color: "#9C27B0",
    },
    {
      label: "Spend today",
      value: formatCost(t.cost),
      unit: "USD",
      delta: formatDelta(t.cost, y.cost),
      spark: buildSparkData(runs, (r) => r.cost),
      color: "#22c55e",
    },
    {
      label: "Success rate",
      value: `${t.success}%`,
      unit: "",
      delta: formatDelta(t.success, y.success),
      spark: buildSuccessSpark(runs),
      color: "#2A6FDB",
    },
  ];
}
