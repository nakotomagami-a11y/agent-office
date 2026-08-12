"use client";

import { match } from "ts-pattern";
import { useTranslations } from "next-intl";
import { Skeleton } from "@/components/ui/skeleton";
import { Card } from "@/components/ui/card";
import { CardHeader } from "@/components/ui/card-header";
import { StatusDot } from "@/components/ui/status-dot";
import { CodeBlock } from "@/components/ui/code-block";
import { ProseView } from "@/components/ui/prose-view";
import { useRun } from "../hooks/use-runs";
import { formatCost, formatDuration, formatRelative } from "../format/format-run-meta";
import { SubAgentBlock } from "./sub-agent-block";

export type RunDetailProps = { runId: string };

export function RunDetail({ runId }: RunDetailProps) {
  const t = useTranslations();
  const { data: run, isLoading } = useRun(runId);

  if (isLoading) {
    return (
      <div className="overflow-auto py-[18px] px-6">
        <Skeleton width={220} height={20} />
        <div className="h-4" />
        <Skeleton width="100%" height={300} />
      </div>
    );
  }
  if (!run) {
    return (
      <div className="overflow-auto py-[18px] px-6">
        <p className="text-txt-3">{t("errors.not_found")}</p>
      </div>
    );
  }

  const status = match(run.status)
    .with("running", () => "working" as const)
    .with("done", () => "done" as const)
    .with("error", () => "error" as const)
    .exhaustive();

  return (
    <div className="overflow-auto py-[18px] px-6 flex flex-col gap-[14px]">
      <div className="rounded-[12px] border border-line bg-bg-2 overflow-hidden shrink-0">
        {/* Header */}
        <div className="px-4 py-[12px] flex items-start justify-between gap-3 border-b border-line">
          <div>
            <div className="font-bold text-[14px] text-txt">{run.agentName}</div>
            <div className="mt-[5px] flex items-center gap-[5px] text-[11.5px] font-mono">
              <span className="text-txt-3">{formatRelative(run.ts)}</span>
              <span className="text-txt-4">·</span>
              <span className="text-[#e6b35a]">{formatDuration(run.durMs)}</span>
              <span className="text-txt-4">·</span>
              <span className="text-[#4eb96f]">{formatCost(run.cost)}</span>
            </div>
          </div>
          <StatusDot status={status} />
        </div>

        {/* Metadata */}
        <div className="px-4 py-[10px] grid gap-y-[7px] gap-x-4" style={{ gridTemplateColumns: "76px 1fr" }}>
          <span className="text-[11px] font-mono text-txt-4 self-center uppercase tracking-[0.06em]">{t("run_detail.field_model")}</span>
          <div className="flex items-center gap-[7px]">
            <span className="text-[12.5px] font-mono text-[#82aaff]">{run.model}</span>
            <span className="text-txt-4">·</span>
            <span className="px-[5px] py-[1px] rounded-[4px] text-[10px] font-bold uppercase tracking-[0.07em] bg-[rgba(230,179,90,0.10)] text-[#e6b35a] border border-[rgba(230,179,90,0.22)]">
              {run.effort}
            </span>
          </div>

          <span className="text-[11px] font-mono text-txt-4 self-center uppercase tracking-[0.06em]">{t("run_detail.field_tokens")}</span>
          <div className="flex items-center gap-[6px] font-mono text-[12.5px]">
            <span className="text-[#4eb96f]">{run.tokensIn.toLocaleString()}</span>
            <span className="text-txt-4 text-[10px]">↓</span>
            <span className="text-txt-4">/</span>
            <span className="text-[#f97316]">{run.tokensOut.toLocaleString()}</span>
            <span className="text-txt-4 text-[10px]">↑</span>
          </div>

          {run.cwd ? (
            <>
              <span className="text-[11px] font-mono text-txt-4 self-center uppercase tracking-[0.06em]">{t("run_detail.field_cwd")}</span>
              <span className="text-[12px] font-mono text-txt-2 overflow-hidden text-ellipsis whitespace-nowrap">{run.cwd}</span>
            </>
          ) : null}

          {run.projectId ? (
            <>
              <span className="text-[11px] font-mono text-txt-4 self-center uppercase tracking-[0.06em]">{t("run_detail.field_project")}</span>
              <div className="flex items-center gap-[6px] font-mono text-[12.5px]">
                <span className="text-acc">{run.projectId}</span>
                <span className="text-txt-4">·</span>
                <span className="text-txt-2">{run.instanceLabel ?? run.instanceId}</span>
              </div>
            </>
          ) : null}
        </div>
      </div>

      <Card className="shrink-0">
        <CardHeader title={t("run_detail.prompt_card_title")} />
        <div className="p-4">
          <CodeBlock body={run.prompt} lang="prompt" wrap />
        </div>
      </Card>

      <Card className="shrink-0">
        <CardHeader title={t("run_detail.output_card_title")} />
        <div className="p-4">
          {run.output ? (
            <ProseView body={run.output} />
          ) : (
            <p className="text-txt-3 text-[13px]">{t("run_detail.output_empty")}</p>
          )}
        </div>
      </Card>

      <SubAgentBlock parentRunId={runId} />
    </div>
  );
}
