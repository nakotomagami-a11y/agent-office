"use client";

import { useState } from "react";
import { match } from "ts-pattern";
import { useTranslations } from "next-intl";
import { Skeleton } from "@/components/ui/skeleton";
import { UnitSprite } from "@/components/ui/unit-sprite";
import { unitForAgent } from "@/components/ui/unit-sprite-registry";
import { StatusDot } from "@/components/ui/status-dot";
import { useRuns } from "@/modules/runs/hooks/use-runs";
import { useOfficeStore } from "@/modules/office/hooks/use-office-store";
import {
  formatCost,
  formatDuration,
  formatRelative,
} from "@/modules/runs/format/format-run-meta";
import type { PersistedRun } from "@agent-office/domain/types";

export type ProjectActivityProps = {
  projectId: string;
  /** Called with run metadata once loaded - lets the parent show count in its own header. */
  onMeta?: (info: { count: number; todayCost: number }) => void;
};

const PAGE_SIZE = 5;

export function ProjectActivity({ projectId, onMeta }: ProjectActivityProps) {
  const t = useTranslations();
  const select = useOfficeStore((s) => s.select);
  const { data, isLoading } = useRuns({ projectId, limit: 100 });
  const [visible, setVisible] = useState(PAGE_SIZE);

  const runs = data ?? [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayCost = runs
    .filter((r) => r.ts >= today.getTime())
    .reduce((sum, r) => sum + (r.cost || 0), 0);

  // Notify parent once data lands
  if (!isLoading && onMeta) onMeta({ count: runs.length, todayCost });

  if (isLoading) {
    return (
      <div className="px-[18px] py-[14px] flex flex-col gap-[6px]">
        <Skeleton width="100%" height={44} />
        <Skeleton width="100%" height={44} />
        <Skeleton width="100%" height={44} />
      </div>
    );
  }

  if (runs.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-[8px] py-[32px] px-[18px]">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" className="text-txt-4 opacity-40">
          <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <p className="m-0 text-[13px] text-txt-3 text-center">{t("project_activity.empty")}</p>
      </div>
    );
  }

  const shown = runs.slice(0, visible);
  const hasMore = visible < runs.length;

  return (
    <div>
      {shown.map((run) => (
        <RunRow
          key={run.id}
          run={run}
          onOpen={() => select(run.agentId, { tab: "history", instanceId: run.instanceId ?? null })}
        />
      ))}
      {hasMore && (
        <div className="flex justify-center py-[14px]">
          <button
            type="button"
            onClick={() => setVisible((v) => v + PAGE_SIZE)}
            className="inline-flex items-center gap-[8px] px-[18px] py-[10px] text-[13px] font-semibold text-acc bg-acc-faint border border-[var(--acc-tint)] rounded-[10px] hover:bg-[var(--acc)] hover:text-white hover:border-[var(--acc)] transition-colors duration-150 cursor-pointer"
          >
            Load more
            <span className="font-mono text-[11px] text-txt-3 group-hover:text-white">({runs.length - visible} remaining)</span>
          </button>
        </div>
      )}
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
  return (
    <button
      type="button"
      onClick={onOpen}
      className="w-full bg-transparent border-none text-left cursor-pointer font-[inherit] text-[inherit] p-0 hover:bg-bg-2 transition-colors duration-100"
    >
      <div
        className="grid gap-3 items-center px-[18px] py-[11px] border-b border-line"
        style={{ gridTemplateColumns: "64px 1fr auto auto" }}
      >
        <div className="w-16 h-16" aria-hidden>
          <UnitSprite unit={unit} size={64} animate />
        </div>
        <div className="min-w-0">
          <div className="text-[13px] font-semibold flex items-center gap-1.5">
            {run.agentName}
            <StatusDot status={status} hideLabel />
          </div>
          <div
            className="text-[11.5px] text-txt-3 font-mono overflow-hidden text-ellipsis whitespace-nowrap"
            title={run.prompt}
          >
            {run.prompt}
          </div>
        </div>
        <span className="font-mono text-[11px] text-txt-3">
          {formatDuration(run.durMs)} · {formatCost(run.cost)}
        </span>
        <span className="font-mono text-[11px] text-txt-3 min-w-[60px] text-right">
          {formatRelative(run.ts)}
        </span>
      </div>
    </button>
  );
}
