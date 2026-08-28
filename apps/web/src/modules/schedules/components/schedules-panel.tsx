"use client";

import { useMemo, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion, type Variants } from "framer-motion";
import type { ScheduledJob } from "@agent-office/domain/types";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { CardHeader } from "@/components/ui/card-header";
import { DateTimePicker } from "@/components/ui/date-time-picker";
import { Textarea } from "@/components/ui/textarea";
import { ModalShell } from "@/components/ui/modal-shell";
import { useOfficeAgents } from "@/modules/office/hooks/use-office-agents";
import { useProjects } from "@/modules/projects/hooks/use-projects";
import { whenParts } from "../format/schedule-format";
import { useCreateSchedule, useRunScheduleNow, useSchedules } from "../hooks/use-schedules";
import { SchedulesSummaryTiles } from "./schedules-summary-tiles";
import { SchedulesViewTabs, type ScheduleView } from "./schedules-view-tabs";
import { ScheduleCard } from "./schedule-card";
import { Field, PickerField, agentDisplay, agentItems } from "./schedule-reassign-row";

// Form open/close motion
//
// Open  : height 0 → auto FIRST, then the content fades in  (when: beforeChildren)
// Close : content fades out FIRST, then height auto → 0     (when: afterChildren)
// The toggle button is locked while either sequence is in flight.

const EASE = [0.4, 0, 0.2, 1] as const;
const BOX_VARIANTS: Variants = {
  open: { height: "auto", transition: { height: { duration: 0.28, ease: EASE }, when: "beforeChildren" } },
  collapsed: { height: 0, transition: { height: { duration: 0.26, ease: EASE }, when: "afterChildren" } },
};
const INNER_VARIANTS: Variants = {
  open: { opacity: 1, y: 0, transition: { duration: 0.22, ease: EASE } },
  collapsed: { opacity: 0, y: -6, transition: { duration: 0.16, ease: EASE } },
};
/** Longest of the two sequences (open ≈ 0.28+0.22, close ≈ 0.16+0.26), + slack. */
const MOTION_LOCK_MS = 540;

export function SchedulesPanel() {
  const jobsQ = useSchedules();
  const jobs = useMemo(() => jobsQ.data ?? [], [jobsQ.data]);
  const [creating, setCreating] = useState(false);
  const [animating, setAnimating] = useState(false);
  const lockTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [staleJob, setStaleJob] = useState<ScheduledJob | null>(null);
  const [view, setView] = useState<ScheduleView>("upcoming");
  const runNow = useRunScheduleNow();

  const toggleForm = (next?: boolean) => {
    if (animating) return;
    setCreating((v) => (next === undefined ? !v : next));
    setAnimating(true);
    if (lockTimer.current) clearTimeout(lockTimer.current);
    lockTimer.current = setTimeout(() => setAnimating(false), MOTION_LOCK_MS);
  };

  const groups = useMemo(() => {
    const upcoming = jobs
      .filter((j) => j.status === "pending" || j.status === "firing" || j.status === "needs-attention")
      .sort((a, b) => a.fireAt - b.fireAt);
    const history = jobs
      .filter((j) => j.status === "done" || j.status === "cancelled")
      .sort((a, b) => b.updatedAt - a.updatedAt);
    return { upcoming, recurring: [] as ScheduledJob[], history };
  }, [jobs]);

  const isEmpty = jobs.length === 0;
  const rows = groups[view];

  return (
    <>
      <PageHeader
        title="Schedules"
        sub="standing orders the office runs on its own"
        actions={
          <Button variant="primary" disabled={animating} onClick={() => toggleForm()}>
            <Icon name={creating ? "x" : "clock"} size={14} />
            {creating ? "Close" : "New order"}
          </Button>
        }
      />

      <div className="flex flex-col overflow-y-auto flex-1 min-h-0 px-[24px] pt-[20px] pb-[36px] gap-[16px] [&>*]:shrink-0">
        <SchedulesSummaryTiles jobs={jobs} />

        <AnimatePresence initial={false}>
          {creating && (
            <motion.div key="new-schedule-form" className="overflow-hidden" initial="collapsed" animate="open" exit="collapsed" variants={BOX_VARIANTS}>
              <motion.div variants={INNER_VARIANTS}>
                <NewScheduleForm onDone={() => toggleForm(false)} />
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {isEmpty ? (
          creating || animating ? null : <SchedulesEmpty onCreate={() => toggleForm(true)} />
        ) : (
          <>
            <div className="flex items-center gap-[12px] flex-wrap">
              <SchedulesViewTabs
                view={view}
                setView={setView}
                counts={{ upcoming: groups.upcoming.length, recurring: 0, history: groups.history.length }}
              />
              <span className="flex-1" />
              <span className="font-mono text-[10.5px] text-txt-4 inline-flex items-center gap-[6px]">
                <span className="w-[6px] h-[6px] rounded-full bg-green" />
                jobs fire while the app runs and the machine is awake
              </span>
            </div>

            <div className="flex flex-col gap-[10px]">
              {view === "recurring" ? (
                <RecurringPlaceholder />
              ) : rows.length === 0 ? (
                <EmptyTabState view={view} />
              ) : (
                rows.map((job) => <ScheduleCard key={job.id} job={job} onRunStale={() => setStaleJob(job)} />)
              )}
            </div>
          </>
        )}
      </div>

      <ModalShell
        open={staleJob !== null}
        onClose={() => setStaleJob(null)}
        title="Run overdue work?"
        size="sm"
        footer={
          <>
            <Button size="sm" variant="ghost" onClick={() => setStaleJob(null)}>
              Cancel
            </Button>
            <Button
              size="sm"
              variant="primary"
              onClick={() => {
                if (staleJob) runNow.mutate(staleJob.id);
                setStaleJob(null);
              }}
            >
              Run now
            </Button>
          </>
        }
      >
        {staleJob && (
          <p className="m-0 text-[13px] text-txt-2 leading-[1.55]">
            “{staleJob.label}” was scheduled for {whenParts(staleJob.fireAt).abs} — more than 12 hours ago. It
            wasn’t run automatically. Run it now?
          </p>
        )}
      </ModalShell>
    </>
  );
}

function RecurringPlaceholder() {
  return (
    <div className="p-8 text-center rounded-[16px] surface-sheen shadow-[var(--lift)]">
      <Icon name="refresh" size={24} className="text-txt-4" />
      <div className="mt-2.5 text-[14px] text-txt-2">Recurring orders aren&apos;t wired up yet.</div>
      <div className="mt-1 text-[12px] font-mono text-txt-4">
        Today&apos;s schedules run once, or auto-resume on a rate-limit reset. Daily/weekly repeats are next.
      </div>
    </div>
  );
}

function EmptyTabState({ view }: { view: ScheduleView }) {
  const copy =
    view === "upcoming"
      ? { title: "Nothing queued.", hint: "New orders will show up here once you schedule one." }
      : { title: "No history yet.", hint: "Completed and cancelled orders will land here." };
  return (
    <div className="p-8 text-center rounded-[16px] surface-sheen shadow-[var(--lift)]">
      <Icon name="clock" size={32} className="mx-auto text-txt-4" />
      <div className="mt-3 text-[14px] text-txt-2">{copy.title}</div>
      <div className="mt-1 text-[12px] font-mono text-txt-4">{copy.hint}</div>
    </div>
  );
}

// Empty state — mirrors the projects empty state (glow + tile + CTA)

function SchedulesEmpty({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="flex-1 flex items-center justify-center py-[52px] px-6 animate-[page-fade-in_200ms_ease-out]">
      <div className="flex flex-col items-center text-center max-w-[420px]">
        <div aria-hidden className="relative w-[128px] h-[128px] mb-[22px] flex items-center justify-center shrink-0">
          <div
            className="absolute inset-0 pointer-events-none"
            style={{ background: "radial-gradient(circle at 50% 50%, var(--acc-soft) 0%, transparent 62%)" }}
          />
          <div className="relative w-[64px] h-[64px] rounded-full flex items-center justify-center bg-acc-soft text-acc">
            <Icon name="clock" size={30} />
          </div>
        </div>
        <h2 className="m-0 text-[18px] font-bold tracking-[-0.01em] text-txt leading-tight">Nothing scheduled yet</h2>
        <p className="mt-[10px] mb-0 text-[13px] leading-[1.55] text-txt-2">
          Schedule a task to run at a set time, or auto-resume a run when its rate limit resets — no need to babysit
          the app.
        </p>
        <Button size="default" variant="primary" className="mt-[22px]" onClick={onCreate}>
          <Icon name="plus" size={13} /> New order
        </Button>
      </div>
    </div>
  );
}

function NewScheduleForm({ onDone }: { onDone: () => void }) {
  const { agents } = useOfficeAgents();
  const projectsQ = useProjects();
  const projects = projectsQ.data ?? [];
  const create = useCreateSchedule();

  const [agentId, setAgentId] = useState("");
  const [prompt, setPrompt] = useState("");
  const [when, setWhen] = useState("");
  const [projectId, setProjectId] = useState("");

  const effectiveAgentId = agentId || agents[0]?.id || "";
  const canSubmit = effectiveAgentId && prompt.trim() && when;

  const submit = () => {
    if (!canSubmit) return;
    const fireAt = new Date(when).getTime();
    if (Number.isNaN(fireAt)) return;
    create.mutate({
      fireAt,
      summonRequest: { agentId: effectiveAgentId, prompt: prompt.trim(), projectId: projectId || undefined },
      reason: "manual",
    });
    onDone();
  };

  return (
    <Card className="animate-[page-fade-in_200ms_ease-out]">
      <CardHeader
        title={
          <span className="inline-flex items-center gap-[7px] text-acc">
            <Icon name="clock" size={15} />
            <span className="text-txt">New order</span>
          </span>
        }
        sub="runs once at the chosen time — recurring & watcher orders are on the way"
      />
      <div className="p-4 flex flex-col gap-4">
        <div className="flex gap-4 flex-wrap">
          <Field label="Agent">
            <PickerField
              ariaLabel="Choose agent"
              width="w-[220px]"
              placeholder="Pick an agent"
              display={agentDisplay(agents.find((a) => a.id === effectiveAgentId))}
              items={agentItems(agents, effectiveAgentId, setAgentId)}
            />
          </Field>
          <Field label="Project (optional)">
            <PickerField
              ariaLabel="Choose project"
              width="w-[220px]"
              display={
                projectId ? (
                  <>
                    <Icon name="folder" size={13} className="text-txt-4 shrink-0" />
                    <span className="truncate">{projects.find((p) => p.id === projectId)?.name}</span>
                  </>
                ) : (
                  <span className="text-txt-4">— none —</span>
                )
              }
              items={buildProjectItems(projects, projectId, setProjectId)}
            />
          </Field>
          <Field label="When">
            <DateTimePicker value={when} onChange={setWhen} ariaLabel="Schedule date and time" className="w-[220px]" />
          </Field>
        </div>
        <Field label="Prompt">
          <Textarea rows={3} value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="What should the agent do?" />
        </Field>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="primary" onClick={submit} disabled={!canSubmit}>
            Schedule
          </Button>
          <Button size="sm" variant="ghost" onClick={onDone}>
            Cancel
          </Button>
        </div>
      </div>
    </Card>
  );
}

function buildProjectItems(
  projects: { id: string; name: string }[],
  projectId: string,
  setProjectId: (id: string) => void,
): Array<{ key: string; label: ReactNode; selected: boolean; onSelect: () => void }> {
  return [
    { key: "__none", label: <span className="text-txt-4">— none —</span>, selected: projectId === "", onSelect: () => setProjectId("") },
    ...projects.map((p) => ({
      key: p.id,
      selected: p.id === projectId,
      onSelect: () => setProjectId(p.id),
      label: (
        <span className="flex items-center gap-[9px] min-w-0">
          <Icon name="folder" size={14} className="text-txt-4" />
          <span className="truncate">{p.name}</span>
        </span>
      ),
    })),
  ];
}
