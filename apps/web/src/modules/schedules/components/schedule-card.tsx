import { useState } from "react";
import { useTranslations } from "next-intl";
import type { ScheduledJob } from "@agent-office/domain/types";
import { cn } from "@/lib/cn";
import { Icon } from "@/components/ui/icon";
import { Button } from "@/components/ui/button";
import { AgentAvatar } from "@/components/ui/agent-avatar";
import { unitForAgent } from "@/components/ui/unit-sprite-registry";
import { formatAgentDisplayName } from "@/lib/agent-display-name";
import { ATTENTION_MSG_KEY, whenParts } from "../format/schedule-format";
import { useCancelSchedule, useRunScheduleNow } from "../hooks/use-schedules";
import { ScheduleReassignRow } from "./schedule-reassign-row";

const TIME_BLOCK: Record<ScheduledJob["status"], { label: string; cls: string }> = {
  pending: { label: "ARMED", cls: "text-acc" },
  firing: { label: "RUNNING", cls: "text-green" },
  "needs-attention": { label: "ATTENTION", cls: "text-amber" },
  done: { label: "DONE", cls: "text-txt-3" },
  cancelled: { label: "CANCELLED", cls: "text-txt-4" },
};

function TimeBlock({ job }: { job: ScheduledJob }) {
  const when = whenParts(job.fireAt);
  const tb = TIME_BLOCK[job.status];
  const isDone = job.status === "done" || job.status === "cancelled";
  return (
    <div className="flex flex-col items-center gap-[3px] w-[98px] shrink-0 py-[4px]">
      <span className={cn("font-mono text-[9.5px] font-extrabold tracking-[0.08em]", tb.cls)}>{tb.label}</span>
      {isDone ? (
        <Icon name={job.status === "done" ? "check" : "x"} size={18} className={tb.cls} />
      ) : (
        <span className={cn("font-mono text-[19px] font-extrabold", tb.cls)}>
          {job.status === "firing" ? "now" : when.rel.replace(/^in /, "")}
        </span>
      )}
      <span className="font-mono text-[9.5px] text-txt-4 text-center">{when.abs}</span>
      <span
        className={cn(
          "mt-[2px] font-mono text-[8.5px] font-extrabold tracking-[0.06em] rounded-full px-[7px] py-[1.5px]",
          job.reason === "rate-limit" ? "bg-amber-soft text-amber" : "bg-acc-soft text-acc",
        )}
      >
        {job.reason === "rate-limit" ? "WHEN" : "ONCE"}
      </span>
    </div>
  );
}

export function ScheduleCard({ job, onRunStale }: { job: ScheduledJob; onRunStale: () => void }) {
  const t = useTranslations();
  const cancel = useCancelSchedule();
  const runNow = useRunScheduleNow();
  const [reassigning, setReassigning] = useState(false);
  const isStale = job.status === "needs-attention" && job.attention === "stale";
  const isMissing = job.status === "needs-attention" && job.attention === "missing-instance";
  const isAttention = job.status === "needs-attention";
  const unit = unitForAgent(job.summonRequest.agentId);

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-[14px] surface-sheen shadow-[var(--lift)]",
        isAttention && "ring-1 ring-inset ring-amber",
      )}
    >
      <div className="flex items-center gap-[16px] px-[16px] py-[13px]">
        <TimeBlock job={job} />
        <div className="w-[1px] self-stretch bg-edge shrink-0" />

        <AgentAvatar unit={unit} size={38} className="shrink-0 rounded-[10px]" />

        <div className="flex-1 min-w-0 flex flex-col gap-[4px]">
          <div className="text-[13.5px] font-semibold text-txt leading-snug line-clamp-2">
            {job.summonRequest.prompt || job.label}
          </div>
          <div className="font-mono text-[11px] text-txt-4">
            {formatAgentDisplayName(job.summonRequest.agentId)}
            {job.summonRequest.projectId ? ` · ${job.summonRequest.projectId}` : " · all projects"}
            {(job.status === "done" || job.status === "cancelled") && ` · last ran ${whenParts(job.updatedAt).rel}`}
            {job.attempts > 0 && ` · retry ${job.attempts}/5`}
          </div>
          {isAttention && job.attention && (
            <div className="text-[11.5px] text-amber leading-[1.45]">
              {t(`schedules.attention_${ATTENTION_MSG_KEY[job.attention]}`)}
            </div>
          )}
        </div>

        <div className="flex items-center gap-[6px] shrink-0">
          {isStale && (
            <Button size="sm" variant="primary" onClick={onRunStale}>
              <Icon name="play" size={11} /> Run anyway
            </Button>
          )}
          {job.attention === "retry-exceeded" && (
            <Button size="sm" onClick={() => runNow.mutate(job.id)}>
              <Icon name="play" size={11} /> Run now
            </Button>
          )}
          {isMissing && (
            <Button size="sm" onClick={() => setReassigning((v) => !v)}>
              <Icon name="refresh" size={11} /> Reassign
            </Button>
          )}
          {job.status === "pending" && (
            <IconBtn title="Run now" onClick={() => runNow.mutate(job.id)}>
              <Icon name="play" size={12} />
            </IconBtn>
          )}
          {job.status === "done" || job.status === "cancelled" ? (
            <button
              type="button"
              title="Dismiss"
              onClick={() => cancel.mutate(job.id)}
              className="h-[26px] px-[10px] inline-flex items-center gap-[5px] rounded-[8px] bg-card-2 text-txt-3 text-[12px] font-medium transition-colors hover:bg-red-soft hover:text-red"
            >
              <Icon name="x" size={11} />
              Dismiss
            </button>
          ) : (
            <IconBtn title="Cancel scheduled job" onClick={() => cancel.mutate(job.id)} danger>
              <Icon name="trash" size={12} />
            </IconBtn>
          )}
        </div>
      </div>

      {reassigning && (
        <div className="px-[16px] pb-[13px]">
          <ScheduleReassignRow job={job} onDone={() => setReassigning(false)} />
        </div>
      )}
    </div>
  );
}

function IconBtn({
  children,
  title,
  onClick,
  danger,
}: {
  children: React.ReactNode;
  title: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      className={cn(
        "w-[28px] h-[28px] inline-flex items-center justify-center rounded-[9px] bg-card-2 text-txt-3 transition-colors",
        danger ? "hover:bg-red-soft hover:text-red" : "hover:bg-card-3 hover:text-txt",
      )}
    >
      {children}
    </button>
  );
}
