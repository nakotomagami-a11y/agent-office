"use client";

import { useState } from "react";
import { match } from "ts-pattern";
import { useTranslations } from "next-intl";
import { UnitSprite } from "@/components/ui/unit-sprite";
import { unitForAgent } from "@/components/ui/unit-sprite-registry";
import { StatusDot } from "@/components/ui/status-dot";
import { useRuns } from "@/modules/runs/hooks/use-runs";
import { useOfficeStore } from "@/modules/office/hooks/use-office-store";
import { formatCost, formatDuration, formatRelative } from "@/modules/runs/format/format-run-meta";
import type { PersistedRun } from "@agent-office/domain/types";

export type ProjectRecentRunsProps = { projectId: string };

const PAGE_SIZE = 5;

/**
 * "Recent runs" dashboard card — full run history for the project, newest
 * first. Renamed from the old `ProjectActivity` now that it's a self-contained
 * card (header, count pill, and rows) instead of a bare list the page wrapped.
 */
export function ProjectRecentRuns({ projectId }: ProjectRecentRunsProps) {
  const t = useTranslations();
  const select = useOfficeStore((s) => s.select);
  const { data, isLoading } = useRuns({ projectId, limit: 100 });
  const [visible, setVisible] = useState(PAGE_SIZE);

  const runs = data ?? [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const runsToday = runs.filter((r) => r.ts >= today.getTime()).length;
  const shown = runs.slice(0, visible);
  const hasMore = visible < runs.length;

  return (
    <div className="flex-[1.62] min-w-0 rounded-[24px] surface-sheen shadow-[var(--lift)] pt-[20px] px-[8px] pb-[12px]">
      <div className="flex items-center gap-[12px] px-[16px] pb-[14px]">
        <span className="text-[16px] font-bold whitespace-nowrap">Recent runs</span>
        {runs.length > 0 && (
          <span className="text-[11px] font-semibold px-[8px] py-[3px] rounded-full bg-card-3 text-txt-3 whitespace-nowrap shrink-0">
            {runsToday} today
          </span>
        )}
        <span className="flex-1" />
        {hasMore && (
          <button
            type="button"
            onClick={() => setVisible(runs.length)}
            className="text-[12.5px] font-semibold text-acc cursor-pointer bg-transparent border-none whitespace-nowrap"
          >
            View all
          </button>
        )}
      </div>

      {isLoading ? null : runs.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-[8px] py-[32px] px-[18px]">
          <p className="m-0 text-[13px] text-txt-3 text-center">{t("project_activity.empty")}</p>
        </div>
      ) : (
        <>
          <ColumnHeader />
          {shown.map((run) => (
            <RunRow
              key={run.id}
              run={run}
              onOpen={() => select(run.agentId, { tab: "conversation", instanceId: run.instanceId ?? null })}
            />
          ))}
        </>
      )}
    </div>
  );
}

function ColumnHeader() {
  return (
    <div className="flex items-center gap-[12px] px-[16px] pb-[9px] border-b border-edge text-[11px] font-semibold tracking-[0.04em] uppercase text-txt-4">
      <span className="w-[186px] shrink-0">Agent</span>
      <span className="flex-1 min-w-0">Prompt</span>
      <span className="w-[84px] shrink-0 text-right">Elapsed</span>
      <span className="w-[78px] shrink-0 text-right">Cost</span>
      <span className="w-[58px] shrink-0 text-right">When</span>
    </div>
  );
}

function RunRow({ run, onOpen }: { run: PersistedRun; onOpen: () => void }) {
  const status = match(run.status)
    .with("running", () => "working" as const)
    .with("done", () => "done" as const)
    .with("error", () => "error" as const)
    .exhaustive();
  const unit = unitForAgent(run.agentId);
  const costTone = run.status === "error" ? "bg-red-soft text-red" : "bg-card-3 text-txt-2";

  return (
    <button
      type="button"
      onClick={onOpen}
      className="w-full flex items-center gap-[12px] px-[16px] py-[11px] rounded-[14px] bg-transparent border-none text-left cursor-pointer font-[inherit] transition-colors duration-150 hover:bg-card-2"
    >
      <span className="w-[186px] shrink-0 flex items-center gap-[10px] min-w-0">
        <span className="relative shrink-0 rounded-[10px] overflow-hidden bg-card-3 border border-edge">
          <UnitSprite unit={unit} size={30} />
          <StatusDot
            status={status}
            hideLabel
            size={9}
            className="absolute -bottom-[2px] -right-[2px] rounded-full border-2 border-card"
          />
        </span>
        <span className="text-[13px] font-semibold overflow-hidden text-ellipsis whitespace-nowrap">{run.agentName}</span>
      </span>
      <span className="flex-1 min-w-0 text-[12.5px] text-txt-3 overflow-hidden text-ellipsis whitespace-nowrap" title={run.prompt}>
        {run.prompt}
      </span>
      <span className="w-[84px] shrink-0 font-mono text-[11.5px] text-txt-2 text-right">{formatDuration(run.durMs)}</span>
      <span className="w-[78px] shrink-0 text-right">
        <span className={`text-[11px] font-bold px-[8px] py-[3px] rounded-full ${costTone}`}>{formatCost(run.cost)}</span>
      </span>
      <span className="w-[58px] shrink-0 text-[11.5px] text-txt-4 text-right">{formatRelative(run.ts)}</span>
    </button>
  );
}
