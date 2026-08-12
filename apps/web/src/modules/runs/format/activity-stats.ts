import type { PersistedRun } from "@agent-office/domain/types";

function isoDay(ts: number): string {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.toISOString().slice(0, 10);
}

export function buildSparkData(
  runs: PersistedRun[],
  metric: (r: PersistedRun) => number,
): number[] {
  const days = Array.from({ length: 14 }, (_, i) => {
    const d = new Date(Date.now() - (13 - i) * 86_400_000);
    d.setHours(0, 0, 0, 0);
    return d.toISOString().slice(0, 10);
  });
  return days.map((d) =>
    runs.filter((r) => isoDay(r.ts) === d).reduce((s, r) => s + metric(r), 0),
  );
}

export function buildHeatmapGrid(runs: PersistedRun[]): number[][] {
  const now = new Date();
  const result: number[][] = [];
  for (let d = 6; d >= 0; d--) {
    const row: number[] = new Array(24).fill(0);
    const dayStart = new Date(now);
    dayStart.setHours(0, 0, 0, 0);
    dayStart.setDate(dayStart.getDate() - d);
    const dayEnd = dayStart.getTime() + 86_400_000;
    for (const r of runs) {
      if (r.ts >= dayStart.getTime() && r.ts < dayEnd) {
        const h = new Date(r.ts).getHours();
        row[h] = (row[h] ?? 0) + 1;
      }
    }
    result.push(row);
  }
  return result;
}

export function findBusiestCell(grid: number[][]): { d: number; h: number; v: number } {
  let best = { d: 0, h: 0, v: 0 };
  grid.forEach((row, d) =>
    row.forEach((v, h) => {
      if (v > best.v) best = { d, h, v };
    }),
  );
  return best;
}

export function classifyHeatmapLevel(v: number, max: number): "" | "l1" | "l2" | "l3" | "l4" {
  if (v === 0) return "";
  const r = v / max;
  if (r < 0.25) return "l1";
  if (r < 0.5) return "l2";
  if (r < 0.8) return "l3";
  return "l4";
}

export function buildSuccessSpark(runs: PersistedRun[]): number[] {
  return Array.from({ length: 14 }, (_, i) => {
    const d = new Date(Date.now() - (13 - i) * 86_400_000);
    d.setHours(0, 0, 0, 0);
    const key = d.toISOString().slice(0, 10);
    const dayRuns = runs.filter((r) => isoDay(r.ts) === key);
    if (dayRuns.length === 0) return 100;
    return Math.round(
      (100 * dayRuns.filter((r) => r.status === "done").length) / dayRuns.length,
    );
  });
}

export function buildSparkGeometry(
  data: number[],
  width: number,
  height: number,
): { path: string; area: string } {
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = Math.max(max - min, 0.0001);
  const stepX = width / Math.max(data.length - 1, 1);
  const pts = data.map((v, i) => {
    const x = i * stepX;
    const y = height - ((v - min) / range) * (height - 4) - 2;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  return {
    path: `M ${pts[0]} L ${pts.slice(1).join(" ")}`,
    area: `M 0,${height} L ${pts.join(" ")} L ${width},${height} Z`,
  };
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

export function buildHeatmapDayLabels(): string[] {
  const now = new Date();
  const days: string[] = [];
  for (let d = 6; d >= 0; d--) {
    const dt = new Date(now);
    dt.setDate(dt.getDate() - d);
    days.push(WEEKDAYS[dt.getDay()] ?? "Mon");
  }
  return days;
}
