"use client";

import { useId } from "react";

export type SparklineProps = {
  /** Oldest → newest. Needs at least 2 points to draw a line. */
  values: number[];
  /** Stroke + fill-gradient color (any valid CSS color, including a token var). */
  color: string;
  className?: string;
};

const WIDTH = 240;
const HEIGHT = 62;
/** Vertical padding so the line never touches the top/bottom edge. */
const PAD = 4;

/**
 * Minimal trend sparkline used by the project dashboard's stat cards. Pure
 * presentational — callers pre-compute the day-bucketed values (see
 * `format/run-stats.ts`) so this component never touches real data itself.
 */
export function Sparkline({ values, color, className }: SparklineProps) {
  const gradientId = useId();
  if (values.length < 2) return null;

  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const range = max - min || 1;
  const stepX = WIDTH / (values.length - 1);
  const points = values.map((v, i) => {
    const x = i * stepX;
    const y = HEIGHT - PAD - ((v - min) / range) * (HEIGHT - PAD * 2);
    return [x, y] as const;
  });
  const linePoints = points.map(([x, y]) => `${x},${y}`).join(" ");
  const areaPath = `M${points.map(([x, y]) => `${x},${y}`).join(" L")} L${WIDTH},${HEIGHT} L0,${HEIGHT} Z`;
  const [lastX, lastY] = points.at(-1)!;

  return (
    <svg
      width="100%"
      height={HEIGHT}
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      preserveAspectRatio="none"
      className={className}
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={color} stopOpacity={0.38} />
          <stop offset="1" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      <path d={areaPath} fill={`url(#${gradientId})`} />
      <polyline
        points={linePoints}
        fill="none"
        stroke={color}
        strokeWidth={2.2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx={lastX} cy={lastY} r={3.6} fill={color} stroke="var(--card)" strokeWidth={2.4} />
    </svg>
  );
}
