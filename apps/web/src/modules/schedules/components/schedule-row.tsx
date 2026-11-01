import type { ReactNode } from "react";
import type { ScheduledJob } from "@agent-office/domain/types";
import { cn } from "@/lib/cn";
import { Icon, type IconName } from "@/components/ui/icon";
import { AgentAvatar } from "@/components/ui/agent-avatar";
import { unitForAgent } from "@/components/ui/unit-sprite-registry";
import { formatAgentDisplayName } from "@/lib/agent-display-name";
import { SCHEDULE_MAX_ATTEMPTS } from "@agent-office/domain/config/schedules";
import { clockTime, jobTitle, repeatSummary, shownAt, whenParts } from "../format/schedule-format";
import { useCancelSchedule, useRunScheduleNow } from "../hooks/use-schedules";

const isFinished = (job: ScheduledJob) => job.status === "done";

function rowMeta(job: ScheduledJob): string {
  const parts = [
    formatAgentDisplayName(job.summonRequest.agentId),
    job.summonRequest.projectId ?? "all projects",
  ];
  if (job.repeat) parts.push(repeatSummary(job.repeat));
  if (job.reason === "rate-limit") parts.push(isFinished(job) ? "resumed after rate-limit reset" : "resumes on rate-limit reset");
  if (job.attempts > 0 && !isFinished(job)) parts.push(`retry ${job.attempts}/${SCHEDULE_MAX_ATTEMPTS}`);
  if (isFinished(job)) parts.push(`last ran ${whenParts(job.updatedAt).rel}`);
  return parts.join(" · ");
}

function RowStatus({ job }: { job: ScheduledJob }) {
  if (job.status === "firing") {
    return (
      <span className="text-green">
        <span className="w-[6px] h-[6px] rounded-full bg-green animate-[pulseDot_1.4s_ease-in-out_infinite]" />
        running
      </span>
    );
  }
  if (isFinished(job)) return <span className="text-txt-4">done</span>;
  return <span className="text-acc">{whenParts(job.fireAt).rel}</span>;
}

type RowActionProps = { icon: IconName; title: string; label?: ReactNode; onClick: () => void; disabled?: boolean; tone?: "danger" };

export function RowAction({ icon, title, label, onClick, disabled, tone }: RowActionProps) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "h-[28px] min-w-[28px] px-[8px] inline-flex items-center justify-center gap-[5px] rounded-[9px] text-txt-3 text-[12px] font-medium cursor-pointer border-0 transition-colors focus-visible:outline-2 focus-visible:outline-acc disabled:opacity-50 disabled:cursor-default",
        tone === "danger" ? "bg-transparent hover:bg-red-soft hover:text-red" : "bg-card-2 hover:bg-card-3 hover:text-txt",
      )}
    >
      <Icon name={icon} size={12} />
      {label}
    </button>
  );
}

export function ScheduleRow({ job }: { job: ScheduledJob }) {
  const cancel = useCancelSchedule();
  const runNow = useRunScheduleNow();
  const busy = cancel.isPending || runNow.isPending;

  return (
    <div
      className={cn(
        "group flex items-center gap-[14px] max-[640px]:gap-[8px] px-[12px] py-[10px] rounded-[12px] transition-colors hover:bg-card-2 focus-within:bg-card-2",
        job.status === "firing" && "bg-green-soft",
      )}
    >
      <span className="w-[64px] max-[640px]:w-[44px] shrink-0 font-mono text-[13px] font-bold text-txt">{clockTime(shownAt(job))}</span>
      <AgentAvatar unit={unitForAgent(job.summonRequest.agentId)} size={28} className="shrink-0 rounded-[7px] max-[640px]:hidden" />
      <div className="flex-1 min-w-0 flex flex-col gap-[3px]">
        <div className="text-[13.5px] font-semibold text-txt truncate">{jobTitle(job)}</div>
        <div className="font-mono text-[11px] text-txt-4 truncate">{rowMeta(job)}</div>
      </div>
      {/* Touch screens have no hover: narrow layouts keep the actions visible. */}
      <div className="flex items-center gap-[4px] shrink-0 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 max-[640px]:opacity-100">
        {isFinished(job) ? (
          <RowAction icon="x" title="Dismiss" label="Dismiss" disabled={busy} onClick={() => cancel.mutate(job.id)} />
        ) : (
          <>
            {job.status === "pending" && <RowAction icon="play" title="Run now" disabled={busy} onClick={() => runNow.mutate(job.id)} />}
            <RowAction icon="trash" title={job.repeat ? "Cancel repeating order" : "Cancel scheduled job"} disabled={busy} onClick={() => cancel.mutate(job.id)} />
          </>
        )}
      </div>
      <span className="min-w-[72px] max-[640px]:min-w-0 shrink-0 flex justify-end font-mono text-[11.5px] font-semibold [&>span]:inline-flex [&>span]:items-center [&>span]:gap-[6px]">
        <RowStatus job={job} />
      </span>
    </div>
  );
}
