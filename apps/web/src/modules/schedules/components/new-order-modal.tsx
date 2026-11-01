"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import type { ScheduleRepeatEvery } from "@agent-office/domain/types";
import { SCHEDULE_REPEAT_EVERY } from "@agent-office/domain/config/schedules";
import { cn } from "@/lib/cn";
import { Icon, type IconName } from "@/components/ui/icon";
import { ModalShell } from "@/components/ui/modal-shell";
import { DateTimePicker } from "@/components/ui/date-time-picker";
import { DropdownMenu, type DropdownItem } from "@/components/ui/dropdown-menu";
import { ACCENT_BTN } from "@/components/ui/button";
import { AgentAvatar } from "@/components/ui/agent-avatar";
import { agentDisplayName } from "@/lib/agent-display-name";
import { isMacOS } from "@/lib/updater";
import { useOfficeAgents } from "@/modules/office/hooks/use-office-agents";
import { useProjects } from "@/modules/projects/hooks/use-projects";
import { REPEAT_LABEL, clockTime, dayLabel, scheduleErrorText } from "../format/schedule-format";
import { useCreateSchedule } from "../hooks/use-schedules";
import { agentItems } from "./agent-items";

const CHIP =
  "h-8 max-w-[220px] pl-[6px] pr-[10px] inline-flex items-center gap-[7px] rounded-full bg-card-2 border border-edge-2 text-[12.5px] font-semibold text-txt cursor-pointer transition-colors hover:bg-card-3 hover:border-line-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-acc";
const REPEAT_OPTIONS: Array<ScheduleRepeatEvery | ""> = ["", ...SCHEDULE_REPEAT_EVERY];

const pad = (n: number) => String(n).padStart(2, "0");
/** Next whole hour, in the picker's `YYYY-MM-DDTHH:mm` format. */
function nextHourValue(): string {
  const d = new Date();
  d.setHours(d.getHours() + 1, 0, 0, 0);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:00`;
}

function ChipFace({ lead, value, muted }: { lead: ReactNode; value: ReactNode; muted?: boolean }) {
  return (
    <>
      {lead}
      <span className={cn("truncate", muted && "text-txt-4")}>{value}</span>
      <Icon name="chevron-down" size={12} className="text-txt-4 shrink-0" />
    </>
  );
}

function IconBadge({ name }: { name: IconName }) {
  return (
    <span className="w-[22px] h-[22px] shrink-0 rounded-full inline-flex items-center justify-center bg-card-3 text-txt-3">
      <Icon name={name} size={12} />
    </span>
  );
}

function ChipMenu({ label, value, face, items }: { label: string; value: string; face: ReactNode; items: DropdownItem[] }) {
  return (
    <DropdownMenu ariaLabel={label} triggerAriaLabel={`${label}: ${value}`} align="start" triggerClassName={CHIP} trigger={face} items={items} />
  );
}

type CreatedHandler = (repeat: ScheduleRepeatEvery | undefined) => void;

function NewOrderForm({ onClose, onCreated }: { onClose: () => void; onCreated: CreatedHandler }) {
  const { agents, isLoading: agentsLoading } = useOfficeAgents();
  const projects = useProjects().data ?? [];
  const create = useCreateSchedule();
  const [prompt, setPrompt] = useState("");
  const [agentId, setAgentId] = useState("");
  const [projectId, setProjectId] = useState("");
  const [when, setWhen] = useState(nextHourValue);
  const [repeat, setRepeat] = useState<ScheduleRepeatEvery | "">("");

  const agent = agents.find((a) => a.id === agentId) ?? agents[0];
  const project = projects.find((p) => p.id === projectId);
  const fireAt = new Date(when).getTime();
  const past = !Number.isNaN(fireAt) && fireAt <= Date.now();
  const canSubmit = !!agent && prompt.trim().length > 0 && !Number.isNaN(fireAt) && !past && !create.isPending;
  const agentName = agent ? agentDisplayName(agent) : agentsLoading ? "Loading agents…" : "No agents";
  const whenLabel = Number.isNaN(fireAt) ? "Pick a time" : `${dayLabel(fireAt)}, ${clockTime(fireAt)}`;

  const submit = () => {
    if (!canSubmit || !agent) return;
    create.mutate(
      {
        fireAt,
        summonRequest: { agentId: agent.id, prompt: prompt.trim(), projectId: projectId || undefined },
        reason: "manual",
        repeat: repeat || undefined,
      },
      {
        onSuccess: () => {
          onCreated(repeat || undefined);
          onClose();
        },
      },
    );
  };
  // Window-level and capture phase: the chip menus swallow Enter on their triggers.
  const submitRef = useRef(submit);
  submitRef.current = submit;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Enter" || !(e.metaKey || e.ctrlKey)) return;
      e.preventDefault();
      e.stopPropagation();
      submitRef.current();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, []);

  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-[10px] pt-[16px] pr-[16px] pl-[22px]">
        <span className="inline-flex items-center gap-[7px] py-[4px] pr-[10px] pl-[8px] rounded-full bg-acc-soft text-acc text-[11.5px] font-bold">
          <Icon name="clock" size={12} />
          New order
        </span>
        <span className="flex-1" />
        <button
          type="button"
          aria-label="Close"
          onClick={onClose}
          className="w-[28px] h-[28px] inline-flex items-center justify-center rounded-full border-0 bg-transparent text-txt-4 cursor-pointer hover:bg-card-3 hover:text-txt focus-visible:outline-2 focus-visible:outline-acc"
        >
          <Icon name="x" size={12} />
        </button>
      </div>
      <textarea
        rows={3}
        autoFocus
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        placeholder="What should the agent do?"
        aria-label="Prompt"
        className="resize-none mt-[10px] px-[22px] py-[4px] min-h-[96px] bg-transparent border-0 text-txt [font-family:inherit] text-[19px] font-medium tracking-[-0.015em] leading-[1.45] outline-none placeholder:text-txt-4"
      />
      <div className="flex flex-wrap items-center gap-[6px] px-[18px] pt-[8px] pb-[18px]">
        <ChipMenu
          label="Agent"
          value={agentName}
          face={<ChipFace lead={agent && <AgentAvatar unit={agent.unitChoice} size={22} className="rounded-full bg-card-3" />} value={agentName} />}
          items={agentItems(agents, agent?.id ?? "", setAgentId)}
        />
        <ChipMenu
          label="Project (optional)"
          value={project?.name ?? "none"}
          face={<ChipFace lead={project && <IconBadge name="folder" />} value={project?.name ?? "— none —"} muted={!project} />}
          items={[
            { key: "__none", label: <span className="text-txt-4">— none —</span>, selected: !projectId, onSelect: () => setProjectId("") },
            ...projects.map((p) => ({ key: p.id, label: p.name, selected: p.id === projectId, onSelect: () => setProjectId(p.id) })),
          ]}
        />
        <DateTimePicker
          value={when}
          onChange={setWhen}
          ariaLabel={`When: ${whenLabel}`}
          triggerClassName={CHIP}
          trigger={<ChipFace lead={<IconBadge name="clock" />} value={whenLabel} muted={Number.isNaN(fireAt)} />}
        />
        <ChipMenu
          label="Repeat"
          value={repeat ? REPEAT_LABEL[repeat] : "Once"}
          face={<ChipFace lead={<IconBadge name="refresh" />} value={repeat ? REPEAT_LABEL[repeat] : "Once"} />}
          items={REPEAT_OPTIONS.map((opt) => ({
            key: opt || "__once",
            label: opt ? REPEAT_LABEL[opt] : "Once",
            selected: opt === repeat,
            onSelect: () => setRepeat(opt),
          }))}
        />
      </div>
      <div className="flex items-center gap-[12px] py-[12px] pr-[14px] pl-[22px] border-t border-edge bg-[var(--ao-gutter)] rounded-b-[24px]">
        <span className={cn("text-[11.5px] leading-[1.4]", create.isError || past ? "text-red" : "text-txt-4")}>
          {create.isError
            ? `Couldn't schedule it: ${scheduleErrorText(create.error)}`
            : past
              ? "That time has passed — pick a later one"
              : repeat
              ? `First runs at the chosen time, then ${REPEAT_LABEL[repeat].toLowerCase()}`
              : "Runs once at the chosen time"}
        </span>
        <span className="flex-1" />
        <button
          type="button"
          onClick={submit}
          disabled={!canSubmit}
          className={cn(
            ACCENT_BTN,
            "h-9 pl-[16px] pr-[8px] inline-flex items-center gap-[10px] rounded-full text-[13px] font-bold shrink-0 cursor-pointer shadow-[0_12px_26px_-14px_rgba(139,123,255,0.95)]",
            "disabled:bg-[linear-gradient(120deg,var(--acc-cta),var(--acc-2))] disabled:border-transparent disabled:text-acc-ink disabled:opacity-45",
          )}
        >
          {create.isPending ? "Scheduling…" : "Schedule"}
          <kbd className="px-[7px] py-[2px] rounded-full bg-[rgba(255,255,255,0.16)] font-mono text-[10.5px] font-semibold">
            {isMacOS() ? "⌘↵" : "Ctrl ↵"}
          </kbd>
        </button>
      </div>
    </div>
  );
}

export function NewOrderModal({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: CreatedHandler }) {
  return (
    <ModalShell
      open={open}
      onClose={onClose}
      ariaLabel="New order"
      placement="top"
      maxWidth={620}
      bareContent
      className="rounded-[24px] shadow-[var(--lift),0_50px_120px_-40px_rgba(0,0,0,0.95),0_0_0_6px_color-mix(in_srgb,var(--acc)_7%,transparent)]"
    >
      <NewOrderForm onClose={onClose} onCreated={onCreated} />
    </ModalShell>
  );
}
