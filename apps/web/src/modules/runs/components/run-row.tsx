"use client";

import Link from "next/link";
import { match } from "ts-pattern";
import { StatusDot } from "@/components/ui/status-dot";
import { Icon } from "@/components/ui/icon";
import { Button } from "@/components/ui/button";
import { PAGE_ROUTES } from "@agent-office/domain/config/routes";
import { useCompareStore } from "@/lib/compare-store";
import type { PersistedRun } from "@agent-office/domain/types";
import { formatCost, formatDuration, formatRelative } from "../format/format-run-meta";

export type RunRowProps = {
  run: PersistedRun;
};

export function RunRow({ run }: RunRowProps) {
  const openCompare = useCompareStore((s) => s.openWith);

  const status = match(run.status)
    .with("running", () => "working" as const)
    .with("done", () => "done" as const)
    .with("error", () => "error" as const)
    .exhaustive();

  return (
    <div
      className="group flex items-center border-b border-line"
    >
      {/* The link carries the primary run content */}
      <Link
        href={PAGE_ROUTES.run(run.id)}
        className="flex-1 grid gap-3 px-[14px] py-[10px] no-underline text-txt items-center min-w-0"
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
      </Link>

      {/* Fork button - outside the link so click doesn't navigate */}
      <div className="pr-3 shrink-0">
        <Button
          variant="ghost"
          size="sm"
          className="opacity-0 transition-opacity duration-[120ms] group-hover:opacity-100 group-focus-within:opacity-100"
          title="Fork run"
          aria-label={`Fork run ${run.id}`}
          onClick={() => openCompare(run.id)}
        >
          <Icon name="branch" />
        </Button>
      </div>
    </div>
  );
}
