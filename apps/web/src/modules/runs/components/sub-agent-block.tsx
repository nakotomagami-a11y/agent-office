"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@agent-office/domain/hooks/api";
import { queryKeys } from "@agent-office/domain/hooks/query-keys";
import { API_ROUTES, PAGE_ROUTES } from "@agent-office/domain/config/routes";
import type { PersistedRun } from "@agent-office/domain/types";
import { abortRun } from "@/lib/api/runs-ops";
import { Icon } from "@/components/ui/icon";
import { POLL } from "@/lib/polling";
import { formatCost, formatDuration } from "../format/format-run-meta";
import { groupByBatch } from "../format/group-batch";
import { StatusBadge, type SubAgentDisplayStatus } from "./status-badge";

// Re-export so existing `from "./sub-agent-block"` imports keep resolving.
export { StatusBadge };
export type { SubAgentDisplayStatus };

// ── Cancel button ──────────────────────────────────────────────────────────────

function CancelButton({ runId }: { runId: string }) {
  const [cancelling, setCancelling] = useState(false);

  const handleCancel = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (cancelling) return;
    setCancelling(true);
    try {
      await abortRun(runId);
    } catch {
      setCancelling(false);
    }
  };

  return (
    <button
      type="button"
      className="w-[22px] h-[22px] flex items-center justify-center rounded-[5px] text-ao-fg-2 hover:bg-[var(--ao-bad-soft)] hover:text-[var(--ao-bad)] border border-ao-line-1 bg-ao-bg-3 transition-[color,background] duration-[120ms]"
      onClick={handleCancel}
      disabled={cancelling}
      title="Cancel sub-agent"
      aria-label="Cancel sub-agent"
    >
      <span className="text-[9px] leading-none">■</span>
    </button>
  );
}

// ── Single sub-agent row ───────────────────────────────────────────────────────

function SubAgentRow({ run }: { run: PersistedRun }) {
  const [open, setOpen] = useState(false);
  const isRunning = run.status === "running";
  const durMs = run.status !== "running" ? run.durMs : Date.now() - run.ts;

  return (
    <div className={`border border-ao-line-1 rounded-[8px] overflow-hidden bg-ao-bg-2${open ? " ao-open" : ""}`}>
      <div
        className="flex items-center gap-[10px] px-[12px] py-[8px] cursor-pointer select-none transition-[background] duration-[120ms] hover:bg-ao-bg-3"
        onClick={() => setOpen((v) => !v)}
        role="button"
        aria-expanded={open}
      >
        <div className="w-5 h-5 rounded-full bg-[linear-gradient(135deg,#3b7de8_0%,#1e56c0_100%)] flex items-center justify-center text-white shrink-0" aria-hidden>
          <Icon name="bot-ao" size={11} />
        </div>
        <div className="flex-1 min-w-0 flex items-center gap-[8px]">
          <StatusBadge status={run.status} />
          <span className="text-[12.5px] text-ao-fg-0 font-medium truncate">{run.agentName}</span>
        </div>
        <div className="flex items-center gap-[8px] shrink-0 ml-auto">
          {durMs > 0 && (
            <span className="font-mono text-[11px] text-ao-fg-3">{formatDuration(durMs)}</span>
          )}
          {run.cost > 0 && (
            <span className="font-mono text-[11px] text-ao-fg-3">{formatCost(run.cost)}</span>
          )}
          {isRunning && <CancelButton runId={run.id} />}
          <span className="text-ao-fg-3 transition-transform duration-[180ms] [.ao-open_&]:rotate-90 [.ao-open_&]:text-[var(--ao-accent)]">
            <Icon name="chevron" size={12} />
          </span>
        </div>
      </div>

      {open && (
        <div className="border-t border-ao-line-1 px-[12px] py-[10px] flex flex-col gap-[10px]">
          <div>
            <div className="font-mono text-[9.5px] uppercase tracking-[0.08em] text-ao-fg-3 mb-[4px]">Prompt</div>
            <div className="font-mono text-[11.5px] text-ao-fg-1 whitespace-pre-wrap break-words leading-[1.55] max-h-[120px] overflow-y-auto">
              {run.prompt}
            </div>
          </div>

          {run.status !== "running" && run.output && (
            <div>
              <div className="font-mono text-[9.5px] uppercase tracking-[0.08em] text-ao-fg-3 mb-[4px]">Output</div>
              <div className="font-mono text-[11.5px] text-ao-fg-1 whitespace-pre-wrap break-words leading-[1.55] max-h-[80px] overflow-y-auto">
                {run.output.trimEnd().split("\n").pop()?.trim()}
              </div>
            </div>
          )}

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-[12px] font-mono text-[11px] text-ao-fg-3">
              {run.tokensIn > 0 || run.tokensOut > 0 ? (
                <span>{run.tokensIn.toLocaleString()}↓ / {run.tokensOut.toLocaleString()}↑ tok</span>
              ) : null}
            </div>
            <Link
              href={PAGE_ROUTES.run(run.id)}
              className="inline-flex items-center gap-[5px] text-[11.5px] text-[var(--ao-accent)] font-medium no-underline hover:underline"
              onClick={(e) => e.stopPropagation()}
            >
              Open full transcript
              <Icon name="chevron" size={11} className="rotate-[-90deg]" />
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Parallel batch group ───────────────────────────────────────────────────────

function BatchGroup({ runs }: { runs: PersistedRun[] }) {
  const [open, setOpen] = useState(false);
  const anyRunning = runs.some((r) => r.status === "running");
  const allDone = runs.every((r) => r.status === "done");

  const groupStatus: SubAgentDisplayStatus = anyRunning ? "running" : allDone ? "done" : "error";

  return (
    <div className={`border border-ao-line-1 rounded-[10px] overflow-hidden bg-ao-bg-2${open ? " ao-open" : ""}`}>
      <div
        className="flex items-center gap-[10px] px-[14px] py-[10px] cursor-pointer select-none transition-[background] duration-[120ms] hover:bg-ao-bg-3"
        onClick={() => setOpen((v) => !v)}
        role="button"
        aria-expanded={open}
      >
        <StatusBadge status={groupStatus} />
        <span className="text-[13px] text-ao-fg-0 font-medium flex-1">
          Spawned {runs.length} sub-agents in parallel
        </span>
        <span className="text-ao-fg-3 transition-transform duration-[180ms] [.ao-open_&]:rotate-90 [.ao-open_&]:text-[var(--ao-accent)]">
          <Icon name="chevron" size={14} />
        </span>
      </div>
      {open && (
        <div className="border-t border-ao-line-1 p-[10px] flex flex-col gap-[6px]">
          {runs.map((r) => (
            <SubAgentRow key={r.id} run={r} />
          ))}
        </div>
      )}
    </div>
  );
}

// ── SubAgentBlock (exported) ───────────────────────────────────────────────────

export function SubAgentBlock({ parentRunId }: { parentRunId: string }) {
  const { data: children, isLoading } = useQuery({
    queryKey: queryKeys.runs.children(parentRunId),
    queryFn: () => apiFetch<PersistedRun[]>(API_ROUTES.runChildren(parentRunId)),
    refetchInterval: POLL.RUNS,
  });

  if (isLoading || !children || children.length === 0) return null;

  const batches = groupByBatch(children);

  return (
    <div className="flex flex-col gap-[8px]">
      {batches.map((batch, i) =>
        batch.length >= 3 ? (
          <BatchGroup key={i} runs={batch} />
        ) : (
          batch.map((run) => <SubAgentRow key={run.id} run={run} />)
        ),
      )}
    </div>
  );
}
