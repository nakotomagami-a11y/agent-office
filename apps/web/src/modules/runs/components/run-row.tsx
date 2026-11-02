"use client";

import { StatusDot } from "@/components/ui/status-dot";
import type { PersistedRun } from "@agent-office/domain/types";
import { formatCost, formatDuration, formatRelative, runStatusToDotStatus } from "../format/format-run-meta";

export type RunRowProps = {
  run: PersistedRun;
};

export function RunRow({ run }: RunRowProps) {
  const status = runStatusToDotStatus(run.status);

  return (
    <div
      className="group flex items-center border-b border-line"
    >
      {/* The primary run content — no longer a navigation link since
          /runs/[id] was removed; just displays the row's data. */}
      <div
        className="flex-1 grid gap-3 px-[14px] py-[10px] text-txt items-center min-w-0"
        style={{ gridTemplateColumns: "auto 1fr auto auto" }}
      >
        <StatusDot status={status} hideLabel />
        <div className="min-w-0">
          <div className="text-[13px] font-medium">{run.agentName}</div>
          <div
            className="text-[11.5px] text-txt-3 font-[var(--font-mono)] overflow-hidden text-ellipsis whitespace-nowrap"
            title={run.prompt}
          >
            {run.prompt}
          </div>
        </div>
        <span className="font-[var(--font-mono)] text-[11px] text-txt-3">
          {formatDuration(run.durMs)} · {formatCost(run.cost)}
        </span>
        <span className="font-[var(--font-mono)] text-[11px] text-txt-3 min-w-[56px] text-right">
          {formatRelative(run.ts)}
        </span>
      </div>
    </div>
  );
}
