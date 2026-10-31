"use client";

import { useCallback, useMemo, useState } from "react";
import type { ScheduledJob, ScheduleRepeatEvery } from "@agent-office/domain/types";
import { cn } from "@/lib/cn";
import { Button, ACCENT_BTN } from "@/components/ui/button";
import { Icon, type IconName } from "@/components/ui/icon";
import { ModalShell } from "@/components/ui/modal-shell";
import { groupByDay, scheduleSummary, shownAt, whenParts } from "../format/schedule-format";
import { useRunScheduleNow, useSchedules } from "../hooks/use-schedules";
import { SchedulesViewTabs, type ScheduleView } from "./schedules-view-tabs";
import { ScheduleRow } from "./schedule-row";
import { ScheduleAttentionGroup } from "./schedule-attention";
import { NewOrderModal } from "./new-order-modal";

const CARD = "surface-sheen rounded-[22px] shadow-[var(--lift)]";

const EMPTY_TAB: Record<ScheduleView, { icon: IconName; title: string; hint: string }> = {
  upcoming: { icon: "clock", title: "Nothing queued.", hint: "New orders will show up here once you schedule one." },
  recurring: { icon: "refresh", title: "No repeating orders.", hint: "Set Repeat in New order to run one hourly, daily, on weekdays or weekly." },
  history: { icon: "clock", title: "No history yet.", hint: "Completed orders will land here." },
};

/** Upcoming holds everything that will fire next, a series' next slot included; Recurring lists the series. */
function groupJobs(jobs: ScheduledJob[]) {
  const live = jobs.filter((j) => j.status === "pending" || j.status === "firing").sort((a, b) => a.fireAt - b.fireAt);
  return {
    attention: jobs.filter((j) => j.status === "needs-attention").sort((a, b) => a.fireAt - b.fireAt),
    upcoming: live,
    recurring: live.filter((j) => j.repeat),
    history: jobs.filter((j) => j.status === "done").sort((a, b) => shownAt(b) - shownAt(a)),
  };
}

function ScheduleList({ rows, view }: { rows: ScheduledJob[]; view: ScheduleView }) {
  if (rows.length === 0) {
    const copy = EMPTY_TAB[view];
    return (
      <div className="py-[56px] px-[24px] flex flex-col items-center gap-[6px] text-center">
        <Icon name={copy.icon} size={26} className="text-txt-4" />
        <div className="text-[14px] text-txt-2">{copy.title}</div>
        <div className="font-mono text-[12px] text-txt-4">{copy.hint}</div>
      </div>
    );
  }
  return (
    <>
      {groupByDay(rows, shownAt).map((day) => (
        <section key={day.key} aria-label={`${day.label}, ${day.date}`} className="flex flex-col">
          <div className="flex items-baseline gap-[8px] px-[12px] py-[6px]">
            <span className="text-[12px] font-bold text-txt-2">{day.label}</span>
            <span className="font-mono text-[10.5px] text-txt-4">{day.date}</span>
          </div>
          {day.items.map((job) => <ScheduleRow key={job.id} job={job} />)}
        </section>
      ))}
    </>
  );
}

function SchedulesEmpty({ onCreate }: { onCreate: () => void }) {
  return (
    <div className={cn(CARD, "flex-1 flex items-center justify-center")}>
      <div className="flex flex-col items-center text-center max-w-[420px] gap-[10px]">
        <div className="w-[64px] h-[64px] mb-[8px] rounded-full flex items-center justify-center bg-acc-soft text-acc">
          <Icon name="clock" size={30} />
        </div>
        <h2 className="m-0 text-[18px] font-bold tracking-[-0.01em] text-txt">Nothing scheduled yet</h2>
        <p className="m-0 text-[13px] leading-[1.55] text-txt-2 [text-wrap:pretty]">
          Schedule a task to run at a set time, or auto-resume a run when its rate limit resets — no need to babysit
          the app.
        </p>
        <Button variant="primary" className="mt-[12px] h-auto py-[9px] px-[16px] rounded-[12px] font-bold" onClick={onCreate}>
          <Icon name="plus" size={13} /> New order
        </Button>
      </div>
    </div>
  );
}

function StaleModal({ job, onClose, runNow }: { job: ScheduledJob | null; onClose: () => void; runNow: ReturnType<typeof useRunScheduleNow> }) {
  const run = () => {
    if (job) runNow.mutate(job.id);
    onClose();
  };
  return (
    <ModalShell open={job !== null} onClose={onClose} ariaLabel="Run overdue work?" maxWidth={420} bareContent className="rounded-[18px]">
      <div className="pt-[18px] px-[20px] pb-[6px] text-[15px] font-extrabold tracking-[-0.02em] leading-normal">Run overdue work?</div>
      {job && (
        <p className="m-0 px-[20px] pb-[16px] text-[13px] text-txt-2 leading-[1.55]">
          “{job.summonRequest.prompt || job.label}” was scheduled for {whenParts(job.fireAt).abs} — more than 12 hours
          ago. It wasn’t run automatically. Run it now?
        </p>
      )}
      <div className="flex justify-end gap-[8px] px-[20px] py-[12px] border-t border-edge">
        <Button variant="ghost" className="h-[30px] rounded-[10px] text-[12.5px] font-semibold text-txt-3 hover:text-txt" onClick={onClose}>Cancel</Button>
        <Button variant="primary" className="h-[30px] px-[14px] rounded-[10px] text-[12.5px] font-bold" onClick={run}>Run now</Button>
      </div>
    </ModalShell>
  );
}

export function SchedulesPanel() {
  const jobsQ = useSchedules();
  const jobs = useMemo(() => jobsQ.data ?? [], [jobsQ.data]);
  const [formOpen, setFormOpen] = useState(false);
  const [staleJob, setStaleJob] = useState<ScheduledJob | null>(null);
  const [view, setView] = useState<ScheduleView>("upcoming");
  const closeForm = useCallback(() => setFormOpen(false), []);
  const closeStale = useCallback(() => setStaleJob(null), []);
  const showCreated = useCallback((repeat: ScheduleRepeatEvery | undefined) => setView(repeat ? "recurring" : "upcoming"), []);
  const staleRun = useRunScheduleNow();

  const groups = useMemo(() => groupJobs(jobs), [jobs]);
  const hasJobs = jobs.length > 0;
  const showAttention = view === "upcoming" && groups.attention.length > 0;
  const rows = groups[view];

  return (
    <>
      <div className="flex-1 min-h-0 flex flex-col gap-[18px] px-[20px] pt-[16px] pb-[20px] leading-normal">
        <div className="shrink-0 flex items-end gap-[12px]">
          <div className="flex-1 flex flex-col gap-[6px] min-w-0">
            <h1 className="m-0 text-[30px] font-extrabold tracking-[-0.035em]">Schedules</h1>
            {/* The fixed tagline gives way before the live counts do. */}
            <div className="flex items-center gap-[8px] font-mono text-[11.5px] text-txt-4 min-w-0 overflow-hidden">
              <span className="truncate min-w-[40px]">standing orders the office runs on its own</span>
              {hasJobs && (
                <>
                  <span>·</span>
                  <span className="text-txt-2 whitespace-nowrap">{scheduleSummary(groups.upcoming)}</span>
                </>
              )}
            </div>
          </div>
          {hasJobs && (
            <button
              type="button"
              onClick={() => setFormOpen(true)}
              className={cn(
                ACCENT_BTN,
                "inline-flex items-center gap-[9px] px-[18px] py-[11px] rounded-[14px] text-[13px] font-bold cursor-pointer shrink-0 shadow-[0_14px_30px_-14px_rgba(139,123,255,0.95)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-acc",
              )}
            >
              <Icon name="clock" size={15} />
              New order
            </button>
          )}
        </div>

        {jobsQ.isPending ? null : jobsQ.isError && !jobsQ.data ? (
          <div role="alert" className={cn(CARD, "flex-1 flex flex-col items-center justify-center gap-[10px] text-center")}>
            <div className="text-[14px] text-txt-2">Couldn&apos;t load schedules.</div>
            <Button size="sm" onClick={() => void jobsQ.refetch()}>Try again</Button>
          </div>
        ) : !hasJobs ? (
          <SchedulesEmpty onCreate={() => setFormOpen(true)} />
        ) : (
          <div className={cn(CARD, "flex-1 min-h-0 flex flex-col overflow-hidden")}>
            <div className="shrink-0 flex items-center gap-[12px] flex-wrap px-[14px] py-[13px] border-b border-edge">
              <SchedulesViewTabs
                view={view}
                setView={setView}
                counts={{
                  upcoming: groups.upcoming.length + groups.attention.length,
                  recurring: groups.recurring.length,
                  history: groups.history.length,
                }}
              />
              <span className="flex-1" />
              <span className="font-mono text-[10.5px] text-txt-4 inline-flex items-center gap-[6px]">
                <span className="w-[6px] h-[6px] rounded-full bg-green" />
                jobs fire while the app runs and the machine is awake
              </span>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto px-[8px] pt-[8px] pb-[16px] flex flex-col gap-[14px]">
              {showAttention && <ScheduleAttentionGroup jobs={groups.attention} onRunStale={setStaleJob} runningId={staleRun.isPending ? staleRun.variables : undefined} />}
              {showAttention && rows.length === 0 ? null : <ScheduleList rows={rows} view={view} />}
            </div>
          </div>
        )}
      </div>

      <NewOrderModal open={formOpen} onClose={closeForm} onCreated={showCreated} />
      <StaleModal job={staleJob} onClose={closeStale} runNow={staleRun} />
    </>
  );
}
