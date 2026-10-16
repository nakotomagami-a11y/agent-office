"use client";

import { useRef, useState } from "react";
import { COORDINATOR_SEAT, MAX_RECIPIENTS, SEAT_OS, type SeatOs } from "@agent-office/domain/config/missions";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/cn";
import { useAgents } from "@/modules/agents/hooks/use-agents";
import { useStartMission } from "../hooks/use-missions";
import { arrowKeys, DEVICE_LABEL, errorHint, FOCUS_RING, MAX_USD, MicroLabel, ModalFooter, MoneyField, PrimaryAction, seatNameOk, usdOk } from "./mission-fields";
import type { StartedMission } from "./mission-started";

interface SeatDraft {
  id: number;
  seat: string;
  agent: string;
  os: SeatOs;
  brief: string;
}

type Preset = Omit<SeatDraft, "id" | "agent">;

const PRESETS: Preset[] = [
  { seat: "windows", os: "win32", brief: "Measure and build on Windows. Own your platform page; never edit another seat's." },
  { seat: "macos", os: "darwin", brief: "Measure and build on macOS. Own your platform page; never edit another seat's." },
  { seat: "linux", os: "linux", brief: "Measure and build on Linux. Own your platform page; never edit another seat's." },
];

/** The one template (docs/missions.md, D7): measure on every device, cross-check, design, synthesise,
 *  then build only after the human approves. Every field stays editable. */
const CROSS_DEVICE: SeatDraft[] = [
  { id: 1, seat: COORDINATOR_SEAT, agent: "orchestrator", os: "any", brief: "Run the mission: briefs, roll call, phases, synthesis. Ask the human before building, before changing the shared contract, and before closing." },
  ...PRESETS.map((p, i) => ({ ...p, id: i + 2, agent: "developer" })),
];

const seatName = (v: string) => v.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "").slice(0, 32);

function SeatCard({ seat: s, index, agents, onPatch, onRemove }: {
  seat: SeatDraft; index: number; agents: string[]; onPatch: (p: Partial<SeatDraft>) => void; onRemove: () => void;
}) {
  const lead = index === 0;
  const options = agents.includes(s.agent) ? agents : [s.agent, ...agents];
  return (
    <li>
      <div role="group" aria-label={s.seat || `seat ${index + 1}`} className="rounded-[14px] border border-edge bg-card-2 shadow-[var(--inset-hi)]">
        <div className="flex items-center gap-2 pt-2 pr-2 pl-3">
          <span className="w-4 font-[family-name:var(--font-mono)] text-[10px] text-txt-4">{String(index + 1).padStart(2, "0")}</span>
          <input aria-label="Seat name" value={s.seat} disabled={lead} placeholder="seat name" aria-invalid={!seatNameOk(s.seat) || undefined}
            onChange={(e) => onPatch({ seat: seatName(e.target.value) })}
            className="w-[130px] rounded-[8px] border border-transparent bg-transparent px-2 py-1.5 font-[family-name:var(--font-mono)] text-[12.5px] font-medium text-txt outline-none placeholder:text-txt-4/75 enabled:hover:border-edge-2 focus:border-acc-line focus:bg-card disabled:opacity-100" />
          <select aria-label={`Agent for ${s.seat}`} value={s.agent} onChange={(e) => onPatch({ agent: e.target.value })}
            className="h-7 max-w-[140px] cursor-pointer rounded-[8px] border border-edge bg-card-3 px-2 text-[11.5px] font-semibold text-txt-2 outline-none focus:border-acc-line">
            {options.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
          <span className="flex-1" />
          <div role="radiogroup" aria-label={`Device for ${s.seat}`} onKeyDown={arrowKeys(SEAT_OS, s.os, (os) => onPatch({ os: os as SeatOs }))}
            className="flex gap-[2px] rounded-[9px] border border-edge bg-card p-[2px]">
            {SEAT_OS.map((os) => (
              <button key={os} type="button" role="radio" data-value={os} aria-checked={s.os === os} tabIndex={s.os === os ? 0 : -1} title={os} onClick={() => onPatch({ os })}
                className={cn("rounded-[7px] px-[9px] py-1 text-[11px] font-bold transition-all duration-[120ms] hover:text-txt", FOCUS_RING,
                  s.os === os ? "bg-card-3 text-txt" : "text-txt-4")}>
                {DEVICE_LABEL[os]}
              </button>
            ))}
          </div>
          {lead ? (
            <span title="Every mission has a coordinator" className="flex h-7 w-7 items-center justify-center text-txt-4"><Icon name="lock" size={12} /></span>
          ) : (
            <button type="button" aria-label={`Remove seat ${s.seat}`} title="Remove seat" onClick={onRemove}
              className={cn("flex h-7 w-7 items-center justify-center rounded-[8px] text-txt-4 hover:bg-red-soft hover:text-red", FOCUS_RING)}>
              <Icon name="x" size={13} />
            </button>
          )}
        </div>
        <textarea aria-label={`Brief for ${s.seat}`} rows={2} value={s.brief} maxLength={4000} placeholder="What this seat owns, and what it must not touch."
          onChange={(e) => onPatch({ brief: e.target.value })}
          className="block w-full resize-none rounded-b-[14px] border-none bg-transparent pt-1.5 pr-[14px] pb-[11px] pl-11 text-[12.5px] leading-[1.55] text-txt-2 outline-none placeholder:text-txt-4/75 focus-visible:shadow-[inset_0_0_0_1px_var(--acc-line)]" />
      </div>
    </li>
  );
}

function SeatList({ seats, setSeats }: { seats: SeatDraft[]; setSeats: (f: (s: SeatDraft[]) => SeatDraft[]) => void }) {
  const { data: agents } = useAgents();
  const uid = useRef(CROSS_DEVICE.length);
  const add = (p: Preset | null) => setSeats((s) => [...s, { id: ++uid.current, agent: "developer", ...(p ?? { seat: "", os: "any", brief: "" }) }]);
  const full = seats.length >= MAX_RECIPIENTS;
  const presets = full ? [] : PRESETS.filter((p) => !seats.some((s) => s.seat === p.seat));
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline gap-[10px]">
        <span className="text-[12.5px] font-bold text-txt">Seats</span>
        <span className="text-[11px] text-txt-4">Each is claimed from the device it needs, and you accept every claim here.</span>
      </div>
      <ul className="m-0 flex list-none flex-col gap-2 p-0">
        {seats.map((s, i) => (
          <SeatCard key={s.id} seat={s} index={i} agents={(agents ?? []).map((a) => a.name)}
            onPatch={(p) => setSeats((all) => all.map((x) => (x.id === s.id ? { ...x, ...p } : x)))}
            onRemove={() => setSeats((all) => all.filter((x) => x.id !== s.id))} />
        ))}
      </ul>
      <div className="flex flex-wrap items-center gap-1.5">
        {full ? <span className="text-[11px] text-txt-4">A mission holds at most {MAX_RECIPIENTS} seats.</span> : (
          <button type="button" onClick={() => add(null)}
            className={cn("flex items-center gap-1.5 rounded-[10px] border border-dashed border-edge-2 px-3 py-[7px] text-[12px] font-bold text-txt-3 hover:border-acc-line hover:text-txt", FOCUS_RING)}>
            <Icon name="plus" size={12} /> Add a seat
          </button>
        )}
        {presets.map((p) => (
          <button key={p.seat} type="button" onClick={() => add(p)}
            className={cn("rounded-[10px] border border-edge bg-card-2 px-[11px] py-[7px] font-[family-name:var(--font-mono)] text-[11px] text-txt-3 hover:border-edge-2 hover:text-txt", FOCUS_RING)}>
            + {p.seat}
          </button>
        ))}
      </div>
    </div>
  );
}

function summary(seats: SeatDraft[]) {
  const devices = new Set(seats.map((s) => s.os).filter((os) => os !== "any")).size;
  return `${seats.length} seat${seats.length === 1 ? "" : "s"} · ${devices ? `${devices} device type${devices > 1 ? "s" : ""}` : "any device"}`;
}

function missingBits(title: string, goal: string, budgetUsd: number, capUsd: number, seats: SeatDraft[]): string[] {
  const names = seats.map((s) => s.seat);
  return [
    !title.trim() && "a title",
    !goal.trim() && "a goal",
    !usdOk(budgetUsd) && `a budget up to $${MAX_USD}`,
    !usdOk(capUsd) && `a cap up to $${MAX_USD}`,
    capUsd > budgetUsd && "a cap within budget",
    !names.every(seatNameOk) && "seat names that start with a letter (a-z, 0-9, -)",
    new Set(names).size !== names.length && "unique seat names",
  ].filter((b): b is string => !!b);
}

export function MissionStartForm({ projectId, onStarted }: { projectId: string; onStarted: (m: StartedMission) => void }) {
  const [title, setTitle] = useState("");
  const [goal, setGoal] = useState("");
  const [budget, setBudget] = useState("20");
  const [cap, setCap] = useState("5");
  const [seats, setSeats] = useState<SeatDraft[]>(CROSS_DEVICE);
  const start = useStartMission();
  const [error, setError] = useState<string | null>(null);
  const edit = <T,>(set: (v: T) => void) => (v: T) => { setError(null); set(v); };

  const budgetUsd = parseFloat(budget) || 0;
  const capUsd = parseFloat(cap) || 0;
  const capOver = capUsd > budgetUsd;
  const missing = missingBits(title, goal, budgetUsd, capUsd, seats);
  const ready = missing.length === 0 && !start.isPending;

  const submit = () => {
    setError(null);
    const spec = seats.map(({ seat, agent, os, brief }) => ({ seat, agent, os, brief }));
    start.mutate({ projectId, title: title.trim(), goal, budgetUsd, capUsd, seats: spec }, {
      onSuccess: (r) => onStarted({ missionId: r.missionId, pr: r.pr, url: r.url, title: title.trim(), seats: spec }),
      onError: (e) => setError(errorHint(e)),
    });
  };

  return (
    <>
      <div className="flex min-h-0 flex-1 flex-col gap-[18px] overflow-y-auto px-[22px] pt-[18px] pb-1.5">
        <div className="rounded-[12px] border border-edge bg-card-2 px-[13px] py-[11px] text-[12px] leading-[1.55] text-txt-3 [text-wrap:pretty]">
          For work across devices or days. Everything on this machine and done today? <span className="font-bold text-acc">An orchestrator chat is cheaper.</span>
        </div>
        <div className="flex flex-col gap-[10px]">
          <input aria-label="Mission title" value={title} maxLength={200} onChange={(e) => edit(setTitle)(e.target.value)} placeholder="Media perception on three OSes"
            className="w-full rounded-[6px] border-none bg-transparent py-1 text-[20px] font-extrabold tracking-[-0.02em] text-txt outline-none placeholder:text-txt-4/75 focus-visible:shadow-[0_1px_0_var(--acc-line)]" />
          <label className="flex flex-col gap-1.5">
            <MicroLabel>Goal · the coordinator and every seat read this</MicroLabel>
            <textarea rows={3} value={goal} maxLength={8000} onChange={(e) => edit(setGoal)(e.target.value)} placeholder="What done looks like, and what must hold across every platform."
              className="w-full resize-y rounded-[12px] border border-edge bg-card-2 px-[13px] py-[11px] text-[13px] leading-[1.55] text-txt outline-none placeholder:text-txt-4/75 focus:border-acc-line" />
          </label>
        </div>
        <div className="flex gap-3">
          <MoneyField label="Mission budget" value={budget} onChange={edit(setBudget)} note="all seats, all devices" invalid={!usdOk(budgetUsd)} />
          <MoneyField label="This device's coordinator cap" value={cap} onChange={edit(setCap)} invalid={capOver || !usdOk(capUsd)}
            note={capOver ? "over budget" : usdOk(budgetUsd) ? `${Math.round((capUsd / budgetUsd) * 100)}% of budget` : undefined} />
        </div>
        <SeatList seats={seats} setSeats={(f) => { setError(null); setSeats(f); }} />
      </div>
      <ModalFooter className="mt-[10px]">
        <div className="flex shrink-0 flex-col gap-0.5">
          <span className="text-[12px] font-bold text-txt">{summary(seats)}</span>
          <span className="font-[family-name:var(--font-mono)] text-[10px] text-txt-4">opens a draft PR on this project&apos;s repo</span>
        </div>
        <span aria-live="polite" className={cn("min-w-0 flex-1 text-right text-[11px]", error ? "text-red" : "text-txt-4")}>
          {error ?? (missing.length > 0 ? `Needs ${missing.join(", ")}` : "")}
        </span>
        <PrimaryAction ready={ready} onClick={submit}>{start.isPending ? "Opening the hub…" : "Start mission"}</PrimaryAction>
      </ModalFooter>
    </>
  );
}
