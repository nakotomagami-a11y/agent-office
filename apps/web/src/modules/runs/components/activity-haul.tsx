import type { PersistedRun } from "@agent-office/domain/types";
import { useMemo } from "react";
import { buildHaulStats } from "../derive/activity-haul";

export function ActivityHaul({ runs }: { runs: PersistedRun[] }) {
  const haul = useMemo(() => buildHaulStats(runs), [runs]);
  const pct = Math.min(100, Math.round((haul.runsToday / Math.max(1, haul.dailyGoal)) * 100));

  return (
    <div className="basis-[440px] flex-[2] flex flex-col gap-[14px] rounded-[16px] surface-sheen shadow-[var(--lift)] px-[20px] py-[18px]">
      <div className="flex items-center gap-[10px]">
        <span className="font-mono text-[9.5px] font-extrabold tracking-[0.09em] uppercase text-txt-4">
          Today&apos;s haul
        </span>
        <span className="flex-1" />
        {haul.streakDays > 1 && (
          <span className="inline-flex items-center gap-[5px] px-[9px] py-[3px] rounded-full bg-amber-soft text-amber font-mono text-[10.5px] font-bold">
            🔥 {haul.streakDays}-day streak
          </span>
        )}
      </div>

      <div className="flex items-end gap-[10px]">
        <span className="font-extrabold text-txt text-[38px] leading-none tracking-[-0.02em]">{haul.runsToday}</span>
        <span className="text-txt-3 text-[13px] pb-[3px]">runs completed</span>
        <span className="flex-1" />
        <span className="font-mono text-[13px] font-bold text-acc pb-[3px]">+{haul.xpToday} xp</span>
      </div>

      <div className="h-[8px] rounded-full bg-card-3 overflow-hidden">
        <div
          className="h-full rounded-full bg-[linear-gradient(90deg,var(--acc-cta),var(--acc-2))]"
          style={{ width: `${pct}%` }}
        />
      </div>

      <div className="flex items-center gap-[10px] font-mono text-[11px] text-txt-4">
        <span>
          daily goal {haul.runsToday} / {haul.dailyGoal} runs
        </span>
        <span className="flex-1" />
        <span>
          level {haul.level} · next in {haul.runsToNextLevel} runs
        </span>
      </div>
    </div>
  );
}
