"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { ModalShell } from "@/components/ui/modal-shell";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useRun, useRuns } from "@/modules/runs/hooks/use-runs";
import { useCompareStore } from "@/lib/compare-store";
import { formatCost, formatRelative } from "@/modules/runs/format/format-run-meta";
import type { PersistedRun } from "@agent-office/domain/types";

export function CompareModal() {
  const t = useTranslations("compare");
  const open = useCompareStore((s) => s.open);
  const baseRunId = useCompareStore((s) => s.baseRunId);
  const close = useCompareStore((s) => s.close);

  const baseQ = useRun(baseRunId);
  const baseRun = baseQ.data ?? null;

  // Load runs for the same agent so the right-pane select has options
  const agentRunsQ = useRuns({
    agentId: baseRun?.agentId,
    limit: 100,
  });
  const candidateRuns = (agentRunsQ.data ?? []).filter((r) => r.id !== baseRunId);

  const [compareId, setCompareId] = useState<string | null>(null);
  const compareQ = useRun(compareId);
  const compareRun = compareQ.data ?? null;

  return (
    <ModalShell
      open={open}
      onClose={close}
      title={t("title")}
      size="lg"
      footer={
        <Button onClick={close}>
          {t("close")}
        </Button>
      }
    >
      <div
        className="flex flex-col gap-4 min-h-[200px]"
        style={{ gridTemplateColumns: "1fr 1fr" }}
      >
        {/* Left pane - base run */}
        <div>
          <PaneLabel>{t("base_run")}</PaneLabel>
          {baseQ.isLoading ? (
            <Skeleton width="100%" height={160} />
          ) : baseRun ? (
            <RunPane run={baseRun} />
          ) : (
            <Empty />
          )}
        </div>

        {/* Right pane - comparison run */}
        <div>
          <PaneLabel>{t("compare_with")}</PaneLabel>
          <select
            value={compareId ?? ""}
            onChange={(e) => setCompareId(e.target.value || null)}
            aria-label={t("compare_with")}
            className="w-full h-8 px-2 mb-3 border border-line-2 rounded-[var(--r-md)] bg-bg-1 text-txt font-[var(--font-sans)] text-[13px]"
          >
            <option value="">{t("pick_run")}</option>
            {candidateRuns.map((r) => (
              <option key={r.id} value={r.id}>
                {formatRelative(r.ts)} · {r.prompt.slice(0, 50)}
              </option>
            ))}
          </select>
          {compareQ.isLoading ? (
            <Skeleton width="100%" height={160} />
          ) : compareRun ? (
            <RunPane run={compareRun} />
          ) : (
            <Empty message={t("pick_run")} />
          )}
        </div>
      </div>
    </ModalShell>
  );
}

function PaneLabel({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="text-[11px] font-[var(--font-mono)] text-txt-3 uppercase tracking-[0.06em] font-semibold mb-2"
    >
      {children}
    </div>
  );
}

function RunPane({ run }: { run: PersistedRun }) {
  return (
    <div
      className="flex flex-col gap-[10px] bg-bg-2 border border-line rounded-[var(--r-md)] p-3"
    >
      {/* Prompt */}
      <p
        className="m-0 text-[13px] italic text-txt-2 overflow-hidden"
        style={{ display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical" }}
      >
        {run.prompt}
      </p>

      {/* Model + cost badge */}
      <div className="flex gap-[6px] flex-wrap">
        <Badge>{run.model ?? "default"}</Badge>
        <Badge>{formatCost(run.cost)}</Badge>
        <Badge>{(run.tokensIn + run.tokensOut).toLocaleString()} tok</Badge>
      </div>

      {/* Output */}
      <pre
        className="m-0 overflow-auto max-h-[300px] text-[12px] font-[var(--font-mono)] whitespace-pre-wrap break-words text-txt bg-bg-1 border border-line rounded-[6px] px-[10px] py-2"
      >
        {run.output || "(no output)"}
      </pre>
    </div>
  );
}

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span
      className="inline-block font-[var(--font-mono)] text-[11px] px-2 py-[2px] rounded-full bg-bg-1 border border-line text-txt-2"
    >
      {children}
    </span>
  );
}

function Empty({ message }: { message?: string }) {
  return (
    <div
      className="py-8 text-center text-[13px] text-txt-3"
    >
      {message ?? "-"}
    </div>
  );
}
