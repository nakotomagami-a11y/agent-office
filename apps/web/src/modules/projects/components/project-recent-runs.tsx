"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRuns } from "@/modules/runs/hooks/use-runs";
import { useAgentUnits } from "@/modules/runs/hooks/use-agent-units";
import { RunAvatar } from "@/modules/runs/components/run-avatar";
import type { UnitSelection } from "@/components/ui/unit-sprite-registry";
import { useOfficeStore } from "@/modules/office/hooks/use-office-store";
import { formatDuration, formatRelative } from "@/modules/runs/format/format-run-meta";
import { costDisplay } from "@/modules/providers/format/provider-format";
import { formatRunCost } from "@/modules/providers/format/run-cost";
import { useCostWords } from "@/modules/providers/hooks/use-cost-words";
import { cn } from "@/lib/cn";
import type { PersistedRun } from "@agent-office/domain/types";

export type ProjectRecentRunsProps = { projectId: string };

const PAGE_SIZE = 5;

const STATUS_DOT: Record<PersistedRun["status"], string> = {
  running: "bg-status-working",
  done: "bg-green",
  error: "bg-red",
};

/** "Recent runs" dashboard card — the project's run history, newest first; a row opens its conversation. */
export function ProjectRecentRuns({ projectId }: ProjectRecentRunsProps) {
  const t = useTranslations();
  const select = useOfficeStore((s) => s.select);
  const unitByAgent = useAgentUnits();
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
            className="text-[12.5px] font-semibold text-acc cursor-pointer bg-transparent border-none p-0 whitespace-nowrap rounded-[6px] hover:text-txt transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-acc focus-visible:outline-offset-2"
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
          {shown.map((run, i) => (
            <RunRow
              key={run.id}
              run={run}
              striped={i % 2 === 0}
              unitByAgent={unitByAgent}
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
    <div className="flex items-center gap-[12px] px-[16px] pb-[9px] text-[11px] font-semibold tracking-[0.04em] uppercase text-txt-4">
      <span className="w-[186px] shrink-0">Agent</span>
      <span className="flex-1 min-w-0">Prompt</span>
      <span className="w-[84px] shrink-0 text-right">Elapsed</span>
      <span className="w-[78px] shrink-0 text-right">Cost</span>
      <span className="w-[58px] shrink-0 text-right">When</span>
    </div>
  );
}

function RunRow({
  run,
  striped,
  unitByAgent,
  onOpen,
}: {
  run: PersistedRun;
  striped: boolean;
  unitByAgent: Map<string, UnitSelection>;
  onOpen: () => void;
}) {
  const costWords = useCostWords();
  const shown = costDisplay(run.cost, run.costBasis);
  const zero = shown.kind === "unknown" || shown.kind === "free" || !run.cost;
  const costTone = zero ? "bg-card-3 text-txt-4" : run.status === "error" ? "bg-red-soft text-red" : "bg-green-soft text-green";

  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn(
        "w-full flex items-center gap-[12px] px-[16px] py-[7px] rounded-[14px] border-none text-left text-txt cursor-pointer font-[inherit] transition-[background-color] duration-[160ms] ease-[ease] hover:bg-card-2 focus-visible:outline-2 focus-visible:outline-acc focus-visible:-outline-offset-2",
        striped ? "bg-[color-mix(in_srgb,var(--txt)_2.2%,transparent)]" : "bg-transparent",
      )}
    >
      <span className="w-[186px] shrink-0 flex items-center gap-[10px] min-w-0">
        <span className="relative shrink-0">
          <RunAvatar
            run={run}
            unitByAgent={unitByAgent}
            size={40}
            className="block rounded-none object-contain [filter:drop-shadow(0_4px_8px_rgba(0,0,0,.45))]"
          />
          <span
            className={cn("absolute bottom-0 right-0 w-[10px] h-[10px] rounded-full border-2 border-card", STATUS_DOT[run.status])}
            title={run.status}
          />
        </span>
        <span className="text-[13px] font-semibold overflow-hidden text-ellipsis whitespace-nowrap">{run.agentName}</span>
      </span>
      <span className="flex-1 min-w-0 text-[12.5px] text-txt-3 overflow-hidden text-ellipsis whitespace-nowrap" title={run.prompt}>
        {run.prompt}
      </span>
      <span className="w-[84px] shrink-0 font-mono text-[11.5px] text-txt-2 text-right">{formatDuration(run.durMs)}</span>
      <span className="w-[78px] shrink-0 text-right">
        <span className={cn("text-[11px] font-bold px-[8px] py-[3px] rounded-full whitespace-nowrap", costTone)}>
          {formatRunCost(run.cost, run.costBasis, costWords)}
        </span>
      </span>
      <span className="w-[58px] shrink-0 text-[11.5px] text-txt-4 text-right whitespace-nowrap">{formatRelative(run.ts)}</span>
    </button>
  );
}
