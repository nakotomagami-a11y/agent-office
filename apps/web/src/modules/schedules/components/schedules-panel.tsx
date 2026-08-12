"use client";

import { useMemo, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion, type Variants } from "framer-motion";
import type { ScheduledJob } from "@agent-office/domain/types";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/button";
import { ACCENT_BTN } from "@/lib/button-styles";
import { Icon } from "@/components/ui/icon";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { CardHeader } from "@/components/ui/card-header";
import { DropdownMenu, type DropdownItem } from "@/components/ui/dropdown-menu";
import { DateTimePicker } from "@/components/ui/date-time-picker";
import { TextInput } from "@/components/ui/text-input";
import { Textarea } from "@/components/ui/textarea";
import { Tag } from "@/components/ui/tag";
import { ModalShell } from "@/components/ui/modal-shell";
import { AgentAvatar } from "@/components/ui/agent-avatar";
import { unitForAgent, type UnitSelection } from "@/components/ui/unit-sprite-registry";
import { formatAgentDisplayName } from "@/lib/agent-display-name";
import { useOfficeAgents } from "@/modules/office/hooks/use-office-agents";
import { useProjects } from "@/modules/projects/hooks/use-projects";
import {
  useCancelSchedule,
  useCreateSchedule,
  useReassignSchedule,
  useRunScheduleNow,
  useSchedules,
} from "../hooks/use-schedules";

// Small helpers

/** Decorative clock glyph — the icon set has no clock, so we hand-draw one
 *  that inherits `currentColor` and stays crisp at any size. */
function ClockGlyph({ size = 16, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.9}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7.5V12l3 2" />
    </svg>
  );
}

function whenParts(ms: number): { abs: string; rel: string; future: boolean } {
  const d = new Date(ms);
  const diff = ms - Date.now();
  const mins = Math.round(Math.abs(diff) / 60_000);
  const mag =
    mins < 1 ? "now"
    : mins < 60 ? `${mins}m`
    : mins < 1440 ? `${Math.round(mins / 60)}h`
    : `${Math.round(mins / 1440)}d`;
  const abs = d.toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  const future = diff >= 0;
  return { abs, rel: future ? (mins < 1 ? "firing now" : `in ${mag}`) : `${mag} ago`, future };
}

const ATTENTION_TEXT: Record<NonNullable<ScheduledJob["attention"]>, string> = {
  stale: "More than 12h overdue — confirm before running.",
  "missing-instance": "The target agent no longer exists. Reassign it.",
  "retry-exceeded": "Still rate-limited after 5 retries. Run manually when ready.",
};

type PillStyle = { label: string; cls: string; pulse?: boolean };
const STATUS_PILL: Record<ScheduledJob["status"], PillStyle> = {
  firing: {
    label: "running",
    cls: "text-status-working bg-[color-mix(in_srgb,var(--color-status-working)_12%,transparent)] border-[color-mix(in_srgb,var(--color-status-working)_30%,transparent)]",
    pulse: true,
  },
  pending: { label: "scheduled", cls: "text-acc bg-acc-faint border-acc-tint" },
  "needs-attention": {
    label: "needs attention",
    cls: "text-status-queued bg-[color-mix(in_srgb,var(--color-status-queued)_14%,transparent)] border-[color-mix(in_srgb,var(--color-status-queued)_32%,transparent)]",
  },
  done: { label: "done", cls: "text-txt-3 bg-bg-2 border-line" },
  cancelled: { label: "cancelled", cls: "text-txt-3 bg-bg-2 border-line" },
};

function StatusPill({ status }: { status: ScheduledJob["status"] }) {
  const p = STATUS_PILL[status];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-[5px] rounded-full border px-[8px] py-[2px] text-[10.5px] font-mono uppercase tracking-[0.04em]",
        p.cls,
      )}
    >
      {p.pulse && <span className="w-[5px] h-[5px] rounded-full bg-status-working animate-[pulseDot_1.8s_infinite]" />}
      {p.label}
    </span>
  );
}

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

// Panel

export function SchedulesPanel() {
  const jobsQ = useSchedules();
  const jobs = useMemo(() => jobsQ.data ?? [], [jobsQ.data]);
  const [creating, setCreating] = useState(false);
  const [animating, setAnimating] = useState(false);
  const lockTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [staleJob, setStaleJob] = useState<ScheduledJob | null>(null);
  const runNow = useRunScheduleNow();

  // Toggle the create form. Ignored while a previous open/close is still
  // animating, so the button can't be spammed mid-motion.
  const toggleForm = (next?: boolean) => {
    if (animating) return;
    setCreating((v) => (next === undefined ? !v : next));
    setAnimating(true);
    if (lockTimer.current) clearTimeout(lockTimer.current);
    lockTimer.current = setTimeout(() => setAnimating(false), MOTION_LOCK_MS);
  };

  const groups = useMemo(() => {
    const attention = jobs.filter((j) => j.status === "needs-attention");
    const upcoming = jobs
      .filter((j) => j.status === "pending" || j.status === "firing")
      .sort((a, b) => a.fireAt - b.fireAt);
    const recent = jobs
      .filter((j) => j.status === "done" || j.status === "cancelled")
      .sort((a, b) => b.updatedAt - a.updatedAt);
    return { attention, upcoming, recent };
  }, [jobs]);

  const isEmpty = jobs.length === 0;

  return (
    <>
      <PageHeader
        title="Schedules"
        sub="· tasks the app runs on its own"
        actions={
          <button
            type="button"
            onClick={() => toggleForm()}
            disabled={animating}
            className={cn("inline-flex items-center gap-[6px] font-semibold cursor-pointer px-[14px] py-[8px] rounded-[9px] text-[13px]", ACCENT_BTN)}
          >
            <Icon name={creating ? "x" : "plus"} size={13} />
            {creating ? "Close" : "New scheduled task"}
          </button>
        }
      />

      <div className="flex flex-col overflow-y-auto flex-1 min-h-0 px-[24px] pt-[20px] pb-[36px] gap-[18px] [&>*]:shrink-0">
        {/* Intro hero — ambient gradient + clock tile, matches the project hero vibe. */}
        <section className="relative overflow-hidden rounded-[var(--r-lg)] border border-line bg-bg-1 shadow-1">
          <div
            aria-hidden
            className="absolute inset-0 pointer-events-none"
            style={{ background: "radial-gradient(ellipse 55% 100% at 100% 0%, rgba(124,106,245,0.16) 0%, transparent 70%)" }}
          />
          <div className="relative z-[1] flex items-center gap-[16px] px-[20px] py-[18px]">
            <div className="shrink-0 w-[42px] h-[42px] rounded-full flex items-center justify-center bg-acc-faint text-acc">
              <ClockGlyph size={22} />
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="m-0 text-[14.5px] font-bold text-txt tracking-[-0.01em]">Automated tasks</h2>
              <p className="mt-[3px] mb-0 text-[12.5px] leading-[1.5] text-txt-2 max-w-[640px]">
                Run a task at a set time, or auto-resume when a rate limit resets. Jobs fire while the app is
                running and the machine is awake.
              </p>
            </div>
            {!isEmpty && (
              <div className="flex items-center gap-[14px] shrink-0 max-[820px]:hidden">
                <HeroStat value={groups.upcoming.length} label="upcoming" />
                {groups.attention.length > 0 && (
                  <HeroStat value={groups.attention.length} label="need attention" tone="warn" />
                )}
              </div>
            )}
          </div>
        </section>

        <AnimatePresence initial={false}>
          {creating && (
            <motion.div
              key="new-schedule-form"
              className="overflow-hidden"
              initial="collapsed"
              animate="open"
              exit="collapsed"
              variants={BOX_VARIANTS}
            >
              <motion.div variants={INNER_VARIANTS}>
                <NewScheduleForm onDone={() => toggleForm(false)} />
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {isEmpty ? (
          creating || animating ? null : <SchedulesEmpty onCreate={() => toggleForm(true)} />
        ) : (
          <div className="flex flex-col gap-[22px]">
            {groups.attention.length > 0 && (
              <ScheduleGroup title="Needs attention" count={groups.attention.length} tone="warn">
                {groups.attention.map((job) => (
                  <ScheduleCard key={job.id} job={job} onRunStale={() => setStaleJob(job)} />
                ))}
              </ScheduleGroup>
            )}
            {groups.upcoming.length > 0 && (
              <ScheduleGroup title="Upcoming" count={groups.upcoming.length}>
                {groups.upcoming.map((job) => (
                  <ScheduleCard key={job.id} job={job} onRunStale={() => setStaleJob(job)} />
                ))}
              </ScheduleGroup>
            )}
            {groups.recent.length > 0 && (
              <ScheduleGroup title="Recent" count={groups.recent.length}>
                {groups.recent.map((job) => (
                  <ScheduleCard key={job.id} job={job} onRunStale={() => setStaleJob(job)} />
                ))}
              </ScheduleGroup>
            )}
          </div>
        )}
      </div>

      <ModalShell
        open={staleJob !== null}
        onClose={() => setStaleJob(null)}
        title="Run overdue work?"
        size="sm"
        footer={
          <>
            <Button size="sm" variant="ghost" onClick={() => setStaleJob(null)}>Cancel</Button>
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
            “{staleJob.label}” was scheduled for {whenParts(staleJob.fireAt).abs} — more than 12 hours ago.
            It wasn’t run automatically. Run it now?
          </p>
        )}
      </ModalShell>
    </>
  );
}

function HeroStat({ value, label, tone }: { value: number; label: string; tone?: "warn" }) {
  return (
    <div className="flex flex-col items-end leading-none">
      <span className={cn("text-[20px] font-bold tabular-nums", tone === "warn" ? "text-status-queued" : "text-txt")}>
        {value}
      </span>
      <span className="mt-[3px] text-[10.5px] font-mono text-txt-3">{label}</span>
    </div>
  );
}

function ScheduleGroup({
  title,
  count,
  tone,
  children,
}: {
  title: string;
  count: number;
  tone?: "warn";
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-[10px]">
      <div className="flex items-center gap-2">
        <h3 className={cn("text-[12px] font-semibold uppercase tracking-[0.05em] m-0", tone === "warn" ? "text-status-queued" : "text-txt-3")}>
          {title}
        </h3>
        <span className="font-mono text-[10px] bg-bg-2 border border-line text-txt-3 rounded-full px-[7px] py-[1px]">
          {count}
        </span>
      </div>
      <div className="flex flex-col gap-[10px]">{children}</div>
    </section>
  );
}

// Row

function ScheduleCard({ job, onRunStale }: { job: ScheduledJob; onRunStale: () => void }) {
  const cancel = useCancelSchedule();
  const runNow = useRunScheduleNow();
  const [reassigning, setReassigning] = useState(false);
  const isStale = job.status === "needs-attention" && job.attention === "stale";
  const isMissing = job.status === "needs-attention" && job.attention === "missing-instance";
  const isAttention = job.status === "needs-attention";
  const when = whenParts(job.fireAt);
  const unit = unitForAgent(job.summonRequest.agentId);

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-[var(--r-lg)] border bg-bg-1 shadow-1 transition-colors",
        isAttention
          ? "border-[color-mix(in_srgb,var(--color-status-queued)_36%,var(--line))]"
          : "border-line hover:border-line-2",
      )}
    >
      {isAttention && (
        <span aria-hidden className="absolute inset-y-0 left-0 w-[3px] bg-status-queued" />
      )}
      <div className="flex items-start gap-[13px] px-4 py-[13px]">
        <AgentAvatar unit={unit} size={40} className="mt-[1px] rounded-[10px]" />

        <div className="flex-1 min-w-0 flex flex-col gap-[7px]">
          <div className="text-[13.5px] font-semibold text-txt leading-snug line-clamp-2">
            {job.summonRequest.prompt || job.label}
          </div>

          <div className="flex items-center gap-[8px] flex-wrap">
            <span className="inline-flex items-center gap-[5px] text-[11.5px] font-medium text-txt-2 bg-bg-2 border border-line rounded-full px-[8px] py-[2px]">
              <Icon name="bot" size={11} className="text-txt-3" />
              {formatAgentDisplayName(job.summonRequest.agentId)}
            </span>

            <span className={cn("inline-flex items-center gap-[5px] font-mono text-[11px]", when.future ? "text-txt-2" : "text-status-queued")}>
              <ClockGlyph size={12} className="text-txt-3" />
              {when.abs}
              <span className={cn("font-semibold", when.future ? "text-acc" : "text-status-queued")}>· {when.rel}</span>
            </span>

            <StatusPill status={job.status} />

            {job.reason === "rate-limit" && (
              <Tag>
                <Icon name="zap" size={10} /> rate-limit resume
              </Tag>
            )}
            {job.attempts > 0 && (
              <span className="font-mono text-[10.5px] text-txt-4">retry {job.attempts}/5</span>
            )}
          </div>

          {isAttention && job.attention && (
            <div className="text-[11.5px] text-status-queued leading-[1.45]">{ATTENTION_TEXT[job.attention]}</div>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {isStale && <Button size="sm" variant="primary" onClick={onRunStale}><Icon name="play" size={11} /> Run anyway</Button>}
          {job.attention === "retry-exceeded" && (
            <Button size="sm" variant="default" onClick={() => runNow.mutate(job.id)}><Icon name="play" size={11} /> Run now</Button>
          )}
          {isMissing && (
            <Button size="sm" variant="default" onClick={() => setReassigning((v) => !v)}><Icon name="refresh" size={11} /> Reassign</Button>
          )}
          {job.status === "done" || job.status === "cancelled" ? (
            <Button size="sm" variant="ghost" onClick={() => cancel.mutate(job.id)}>Dismiss</Button>
          ) : (
            <button
              type="button"
              onClick={() => cancel.mutate(job.id)}
              aria-label="Cancel scheduled job"
              className="w-[30px] h-[30px] inline-flex items-center justify-center rounded-[var(--r-md)] text-txt-3 hover:text-[var(--error)] hover:bg-bg-2 border border-line-2 shadow-1 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-acc"
            >
              <Icon name="trash" size={13} />
            </button>
          )}
        </div>
      </div>

      {reassigning && (
        <div className="px-4 pb-[13px]">
          <ReassignRow job={job} onDone={() => setReassigning(false)} />
        </div>
      )}
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
            style={{ background: "radial-gradient(circle at 50% 50%, rgba(124,106,245,0.20) 0%, transparent 62%)" }}
          />
          <div className="relative w-[64px] h-[64px] rounded-full flex items-center justify-center bg-acc-faint text-acc">
            <ClockGlyph size={30} />
          </div>
        </div>
        <h2 className="m-0 text-[18px] font-bold tracking-[-0.01em] text-txt leading-tight">Nothing scheduled yet</h2>
        <p className="mt-[10px] mb-0 text-[13px] leading-[1.55] text-txt-2">
          Schedule a task to run at a set time, or auto-resume a run when its rate limit resets — no need to babysit
          the app.
        </p>
        <Button size="default" variant="primary" className="mt-[22px]" onClick={onCreate}>
          <Icon name="plus" size={13} /> New scheduled task
        </Button>
      </div>
    </div>
  );
}

// Forms (functionally unchanged, lightly restyled)

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-[6px] min-w-0">
      <span className="text-[10.5px] font-mono tracking-[0.06em] text-txt-3 uppercase">{label}</span>
      {children}
    </label>
  );
}

/**
 * A custom dropdown styled to read as a form field — replaces the native
 * `<select>` (whose OS popup clashed with the app). Uses the app's portalled
 * `DropdownMenu` (keyboard nav, flip-up, scroll) so option rows can carry
 * avatars/icons.
 */
function PickerField({
  display,
  placeholder,
  items,
  ariaLabel,
  width,
}: {
  display: ReactNode;
  placeholder?: string;
  items: DropdownItem[];
  ariaLabel: string;
  width?: string;
}) {
  return (
    <DropdownMenu
      ariaLabel={ariaLabel}
      align="start"
      className={cn("block", width ?? "w-[200px]")}
      triggerClassName="w-full h-8 px-[10px] justify-between bg-bg-1 border border-line-2 rounded-[var(--r-md)] shadow-1 text-txt text-[13px] hover:bg-bg-1 hover:border-acc"
      trigger={
        <>
          <span className="flex items-center gap-[7px] min-w-0 truncate">
            {display ?? <span className="text-txt-3">{placeholder}</span>}
          </span>
          <Icon name="chevron-down" size={14} className="text-txt-3 shrink-0" />
        </>
      }
      items={items}
    />
  );
}

function agentItems(
  agents: { id: string; name: string; unitChoice: UnitSelection }[],
  selectedId: string,
  onPick: (id: string) => void,
): DropdownItem[] {
  return agents.map((a) => ({
    key: a.id,
    selected: a.id === selectedId,
    onSelect: () => onPick(a.id),
    label: (
      <span className="flex items-center gap-[9px] min-w-0">
        <AgentAvatar unit={a.unitChoice} size={20} className="rounded" />
        <span className="truncate">{formatAgentDisplayName(a.name)}</span>
      </span>
    ),
  }));
}

function agentDisplay(agent: { name: string; unitChoice: UnitSelection } | undefined): ReactNode {
  if (!agent) return null;
  return (
    <>
      <AgentAvatar unit={agent.unitChoice} size={20} className="rounded shrink-0" />
      <span className="truncate">{formatAgentDisplayName(agent.name)}</span>
    </>
  );
}

function ReassignRow({ job, onDone }: { job: ScheduledJob; onDone: () => void }) {
  const { agents } = useOfficeAgents();
  const reassign = useReassignSchedule();
  const [agentId, setAgentId] = useState(job.summonRequest.agentId);
  const [instanceId, setInstanceId] = useState(job.summonRequest.instanceId ?? "");

  return (
    <div className="flex items-end gap-2 flex-wrap border-t border-line pt-[12px]">
      <Field label="Agent">
        <PickerField
          ariaLabel="Choose agent"
          width="w-[200px]"
          placeholder="Pick an agent"
          display={agentDisplay(agents.find((a) => a.id === agentId))}
          items={agentItems(agents, agentId, setAgentId)}
        />
      </Field>
      <Field label="Instance">
        <TextInput value={instanceId} onChange={(e) => setInstanceId(e.target.value)} placeholder="default" className="w-[140px]" />
      </Field>
      <Button
        size="sm"
        variant="primary"
        onClick={() => {
          reassign.mutate({ id: job.id, target: { agentId, instanceId: instanceId || undefined } });
          onDone();
        }}
      >
        Save
      </Button>
      <Button size="sm" variant="ghost" onClick={onDone}>Cancel</Button>
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
            <ClockGlyph size={15} />
            <span className="text-txt">New scheduled task</span>
          </span>
        }
        sub="runs once at the chosen time"
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
                projectId
                  ? <><Icon name="folder" size={13} className="text-txt-3 shrink-0" /><span className="truncate">{projects.find((p) => p.id === projectId)?.name}</span></>
                  : <span className="text-txt-3">— none —</span>
              }
              items={[
                { key: "__none", label: <span className="text-txt-3">— none —</span>, selected: projectId === "", onSelect: () => setProjectId("") },
                ...projects.map((p) => ({
                  key: p.id,
                  selected: p.id === projectId,
                  onSelect: () => setProjectId(p.id),
                  label: <span className="flex items-center gap-[9px] min-w-0"><Icon name="folder" size={14} className="text-txt-3" /><span className="truncate">{p.name}</span></span>,
                })),
              ]}
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
          <Button size="sm" variant="primary" onClick={submit} disabled={!canSubmit}>Schedule</Button>
          <Button size="sm" variant="ghost" onClick={onDone}>Cancel</Button>
        </div>
      </div>
    </Card>
  );
}
