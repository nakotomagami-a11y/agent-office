import { useState } from "react";
import { useTranslations } from "next-intl";
import type { ScheduledJob } from "@agent-office/domain/types";
import { SCHEDULE_STALE_HOURS } from "@agent-office/domain/config/schedules";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { ModalShell } from "@/components/ui/modal-shell";
import { AgentAvatar } from "@/components/ui/agent-avatar";
import { unitForAgent } from "@/components/ui/unit-sprite-registry";
import { ATTENTION_MSG_KEY, jobTitle, whenParts } from "../format/schedule-format";
import { useCancelSchedule, useRunScheduleNow } from "../hooks/use-schedules";
import { ScheduleReassignRow } from "./schedule-reassign-row";
import { RowAction } from "./schedule-row";

function StaleConfirm({ job, open, onClose, onRun }: { job: ScheduledJob; open: boolean; onClose: () => void; onRun: () => void }) {
  return (
    <ModalShell open={open} onClose={onClose} ariaLabel="Run overdue work?" maxWidth={420} bareContent className="rounded-[18px]">
      <div className="pt-[18px] px-[20px] pb-[6px] text-[15px] font-extrabold tracking-[-0.02em] leading-normal">Run overdue work?</div>
      <p className="m-0 px-[20px] pb-[16px] text-[13px] text-txt-2 leading-[1.55]">
        “{jobTitle(job)}” was scheduled for {whenParts(job.fireAt).abs} — more than {SCHEDULE_STALE_HOURS} hours ago. It
        wasn’t run automatically. Run it now?
      </p>
      <div className="flex justify-end gap-[8px] px-[20px] py-[12px] border-t border-edge">
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button variant="primary" onClick={() => { onRun(); onClose(); }}>Run now</Button>
      </div>
    </ModalShell>
  );
}

type ActionProps = { job: ScheduledJob; busy: boolean; reassigning: boolean; onReassign: () => void; onRunStale: () => void; onRun: () => void };

/** The one primary action each attention reason offers. */
function AttentionAction({ job, busy, reassigning, onReassign, onRunStale, onRun }: ActionProps) {
  switch (job.attention) {
    case "stale":
      return (
        <Button variant="primary" size="compact" className="border-0 shadow-none hover:shadow-none" disabled={busy} onClick={onRunStale}>
          <Icon name="play" size={11} /> Run anyway
        </Button>
      );
    case "missing-instance":
      return (
        <Button size="compact" className="bg-card-2 border-transparent shadow-none hover:bg-card-3" disabled={busy} aria-expanded={reassigning} onClick={onReassign}>
          <Icon name="refresh" size={11} /> Reassign
        </Button>
      );
    case "bridge-missing":
      return null; // the fix is a reinstall; running again cannot help
    default:
      return (
        <Button size="compact" className="bg-card-2 border-transparent shadow-none hover:bg-card-3" disabled={busy} onClick={onRun}>
          <Icon name="play" size={11} /> Run now
        </Button>
      );
  }
}

function AttentionRow({ job }: { job: ScheduledJob }) {
  const t = useTranslations();
  const cancel = useCancelSchedule();
  const runNow = useRunScheduleNow();
  const [reassigning, setReassigning] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const busy = cancel.isPending || runNow.isPending;
  const run = () => runNow.mutate(job.id);

  return (
    <div className="flex flex-col gap-[10px] px-[14px] py-[10px]">
      <div className="flex flex-wrap items-center gap-x-[14px] gap-y-[8px]">
        <AgentAvatar unit={unitForAgent(job.summonRequest.agentId)} size={28} className="shrink-0 rounded-[7px]" />
        <div className="flex-1 min-w-[180px] flex flex-col gap-[3px]">
          <div className="text-[13.5px] font-semibold text-txt truncate">{jobTitle(job)}</div>
          <div className="text-[12px] text-amber leading-[1.45]">{t(`schedules.attention_${ATTENTION_MSG_KEY[job.attention ?? "stale"]}`)}</div>
        </div>
        <span className="font-mono text-[11px] text-txt-4 shrink-0 max-[640px]:hidden">{whenParts(job.fireAt).abs}</span>
        <AttentionAction
          job={job}
          busy={busy}
          reassigning={reassigning}
          onReassign={() => setReassigning((v) => !v)}
          onRunStale={() => setConfirming(true)}
          onRun={run}
        />
        <RowAction icon="trash" title="Cancel scheduled job" tone="danger" disabled={busy} onClick={() => cancel.mutate(job.id)} />
      </div>
      {reassigning && (
        <div className="pl-[42px]">
          <ScheduleReassignRow job={job} onDone={() => setReassigning(false)} />
        </div>
      )}
      <StaleConfirm job={job} open={confirming} onClose={() => setConfirming(false)} onRun={run} />
    </div>
  );
}

/** Jobs the scheduler couldn't run on its own, pinned above the day groups. */
export function ScheduleAttentionGroup({ jobs }: { jobs: ScheduledJob[] }) {
  return (
    <section aria-label="Needs you" className="flex flex-col rounded-[14px] bg-amber-soft">
      <div className="flex items-center gap-[8px] px-[14px] pt-[10px] pb-[4px] font-mono text-[10px] font-extrabold tracking-[0.08em] text-amber">
        <Icon name="alert-circle" size={12} />
        NEEDS YOU · {jobs.length}
      </div>
      {jobs.map((job) => <AttentionRow key={job.id} job={job} />)}
    </section>
  );
}
