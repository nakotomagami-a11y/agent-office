import { useState } from "react";
import { useTranslations } from "next-intl";
import type { ScheduledJob } from "@agent-office/domain/types";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { AgentAvatar } from "@/components/ui/agent-avatar";
import { unitForAgent } from "@/components/ui/unit-sprite-registry";
import { ATTENTION_MSG_KEY, whenParts } from "../format/schedule-format";
import { useCancelSchedule, useRunScheduleNow } from "../hooks/use-schedules";
import { ScheduleReassignRow } from "./schedule-reassign-row";

function AttentionRow({ job, onRunStale, running }: { job: ScheduledJob; onRunStale: () => void; running: boolean }) {
  const t = useTranslations();
  const cancel = useCancelSchedule();
  const runNow = useRunScheduleNow();
  const [reassigning, setReassigning] = useState(false);
  const attention = job.attention ?? "stale";
  const stale = attention === "stale";
  const missing = attention === "missing-instance";
  const busy = running || cancel.isPending || runNow.isPending;

  return (
    <div className="flex flex-col gap-[10px] px-[14px] py-[10px]">
      <div className="flex flex-wrap items-center gap-x-[14px] gap-y-[8px]">
        <AgentAvatar unit={unitForAgent(job.summonRequest.agentId)} size={28} className="shrink-0 rounded-[7px]" />
        <div className="flex-1 min-w-[180px] flex flex-col gap-[3px]">
          <div className="text-[13.5px] font-semibold text-txt truncate">{job.summonRequest.prompt || job.label}</div>
          <div className="text-[12px] text-amber leading-[1.45]">{t(`schedules.attention_${ATTENTION_MSG_KEY[attention]}`)}</div>
        </div>
        <span className="font-mono text-[11px] text-txt-4 shrink-0 max-[640px]:hidden">{whenParts(job.fireAt).abs}</span>
        {stale ? (
          <Button variant="primary" className="h-[28px] px-[12px] rounded-[9px] text-[12px] font-semibold whitespace-nowrap border-0 shadow-none hover:shadow-none" disabled={busy} onClick={onRunStale}>
            <Icon name="play" size={11} /> Run anyway
          </Button>
        ) : attention === "bridge-missing" ? null : (
          <Button
            className="h-[28px] px-[12px] rounded-[9px] text-[12px] font-semibold whitespace-nowrap bg-card-2 border-transparent shadow-none hover:bg-card-3"
            disabled={busy}
            aria-expanded={missing ? reassigning : undefined}
            onClick={() => (missing ? setReassigning((v) => !v) : runNow.mutate(job.id))}
          >
            <Icon name={missing ? "refresh" : "play"} size={11} /> {missing ? "Reassign" : "Run now"}
          </Button>
        )}
        <button
          type="button"
          title="Cancel scheduled job"
          aria-label="Cancel scheduled job"
          disabled={busy}
          onClick={() => cancel.mutate(job.id)}
          className="w-[28px] h-[28px] shrink-0 inline-flex items-center justify-center rounded-[9px] border-0 bg-transparent text-txt-3 cursor-pointer transition-colors hover:bg-red-soft hover:text-red focus-visible:outline-2 focus-visible:outline-acc disabled:opacity-50 disabled:cursor-default disabled:bg-transparent disabled:text-txt-3"
        >
          <Icon name="trash" size={12} />
        </button>
      </div>
      {reassigning && (
        <div className="pl-[42px]">
          <ScheduleReassignRow job={job} onDone={() => setReassigning(false)} />
        </div>
      )}
    </div>
  );
}

/** Jobs the scheduler couldn't run on its own, pinned above the day groups. */
export function ScheduleAttentionGroup({ jobs, onRunStale, runningId }: { jobs: ScheduledJob[]; onRunStale: (job: ScheduledJob) => void; runningId?: string }) {
  return (
    <section aria-label="Needs you" className="flex flex-col rounded-[14px] bg-amber-soft">
      <div className="flex items-center gap-[8px] px-[14px] pt-[10px] pb-[4px] font-mono text-[10px] font-extrabold tracking-[0.08em] text-amber">
        <Icon name="alert-circle" size={12} />
        NEEDS YOU · {jobs.length}
      </div>
      {jobs.map((job) => (
        <AttentionRow key={job.id} job={job} running={job.id === runningId} onRunStale={() => onRunStale(job)} />
      ))}
    </section>
  );
}
