"use client";

import { useRef } from "react";
import { useTranslations } from "next-intl";
import { MAX_RECIPIENTS, MISSION_LIMITS, SEAT_OS, type SeatOs } from "@agent-office/domain/config/missions";
import type { ApiAgent } from "@agent-office/domain/types";
import { AgentAvatar } from "@/components/ui/agent-avatar";
import { DropdownMenu } from "@/components/ui/dropdown-menu";
import { Icon } from "@/components/ui/icon";
import { unitForAgent } from "@/components/ui/unit-sprite-registry";
import { cn } from "@/lib/cn";
import { agentInstalled, seatName, seatNameOk } from "../format/start-form";
import { arrowKeys, FOCUS_RING } from "./mission-fields";

export interface SeatDraft {
  id: number;
  seat: string;
  /** null: the default for this device's agents, resolved once they load. */
  agent: string | null;
  os: SeatOs;
  brief: string;
}

export type SeatPreset = Omit<SeatDraft, "id" | "agent">;

const PRESET_OS = [["windows", "win32"], ["macos", "darwin"], ["linux", "linux"]] as const;

/** The one template's per-platform seats (docs/missions.md, D7). */
export function useSeatPresets(): SeatPreset[] {
  const t = useTranslations("missions");
  return PRESET_OS.map(([seat, os]) => ({ seat, os, brief: t("start.preset_brief", { os: t(`os.${os}`) }) }));
}

function DevicePicker({ seat: s, onPick }: { seat: SeatDraft; onPick: (os: SeatOs) => void }) {
  const t = useTranslations("missions");
  return (
    <div role="radiogroup" aria-label={t("start.device_for", { seat: s.seat || "-" })} onKeyDown={arrowKeys(SEAT_OS, s.os, onPick)}
      className="flex gap-[2px] rounded-[9px] bg-card p-[2px]">
      {SEAT_OS.map((os) => (
        <button key={os} type="button" role="radio" data-value={os} aria-checked={s.os === os} tabIndex={s.os === os ? 0 : -1} onClick={() => onPick(os)}
          className={cn("inline-flex h-[26px] items-center rounded-[7px] px-[9px] text-[11.5px] font-bold transition-all duration-[120ms] hover:text-txt", FOCUS_RING,
            s.os === os ? "bg-card-3 text-txt" : "text-txt-4")}>
          {t(`os.${os}`)}
        </button>
      ))}
    </div>
  );
}

const unitOf = (id: string, agents: readonly ApiAgent[] | undefined) => unitForAgent(id, agents?.find((a) => a.id === id)?.unit);

function AgentSelect({ seat, agent, agents, onPick }: { seat: string; agent: string | null; agents: readonly ApiAgent[] | undefined; onPick: (a: string) => void }) {
  const t = useTranslations("missions.start");
  const installed = agents?.map((a) => a.id);
  const ok = agentInstalled(agent, installed);
  const missing = installed !== undefined && !ok;
  const empty = !agents ? t("agents_loading") : agents.length === 0 ? t("agents_none") : null;
  const name = (a: string) => (installed?.includes(a) ? a : t("agent_missing", { agent: a }));
  const shown = agent ? name(agent) : (empty ?? "");
  const label = t("agent_for", { seat: seat || "-" });
  const row = (id: string, desc: string | undefined) => (
    <>
      <AgentAvatar unit={unitOf(id, agents)} size={24} />
      <span className="flex w-[220px] min-w-0 flex-col">
        <span className="truncate text-[12.5px] font-semibold text-txt">{name(id)}</span>
        {desc && <span aria-hidden className="truncate text-[10.5px] font-normal text-txt-4">{desc}</span>}
      </span>
    </>
  );
  const options = [...(agent && missing ? [{ id: agent, description: undefined }] : []), ...(agents ?? [])];
  const items = empty
    ? [{ key: "", label: empty, disabled: true, onSelect: () => {} }]
    : options.map((a) => ({ key: a.id, label: row(a.id, a.description), selected: a.id === agent, indicatorStyle: "check" as const, onSelect: () => onPick(a.id) }));
  return (
    <DropdownMenu ariaLabel={label} triggerAriaLabel={`${label}: ${shown}`} align="start" items={items} variant="popover" className="min-w-0"
      triggerClassName={cn("h-[30px] max-w-[180px] rounded-[9px] border bg-card-3 pr-[9px] pl-[10px] text-[12px] font-semibold text-txt-2 hover:bg-card-3 hover:text-txt", FOCUS_RING,
        missing ? "border-red hover:border-red" : "border-transparent hover:border-transparent")}
      trigger={<><span className="truncate">{shown}</span><Icon name="chevron-down" size={11} className="h-[11px] w-[11px] [flex:0_0_11px] text-txt-4" /></>} />
  );
}

function SeatCard({ seat: s, index, agent, agents, onPatch, onRemove }: {
  seat: SeatDraft; index: number; agent: string | null; agents: readonly ApiAgent[] | undefined; onPatch: (p: Partial<SeatDraft>) => void; onRemove: () => void;
}) {
  const t = useTranslations("missions.start");
  const lead = index === 0;
  return (
    <li className="motion-safe:animate-[lrIn_280ms_cubic-bezier(.2,.8,.2,1)_both]" style={{ animationDelay: `${index * 40}ms` }}>
      <div role="group" aria-label={s.seat || t("seat_n", { n: index + 1 })}
        className={cn("flex flex-col gap-1.5 rounded-[14px] py-3 pr-3 pl-[14px]", lead ? "bg-[color-mix(in_srgb,var(--acc)_7%,var(--card-2))]" : "bg-card-2")}>
        <div className="flex flex-wrap items-center gap-[10px]">
          <AgentAvatar unit={unitOf(agent ?? s.seat, agents)} size={30} />
          <input aria-label={t("seat_name")} value={s.seat} disabled={lead} placeholder={t("seat_name_placeholder")} aria-invalid={!seatNameOk(s.seat) || undefined}
            onChange={(e) => onPatch({ seat: seatName(e.target.value) })}
            className="w-[120px] rounded-[8px] border-none bg-transparent px-1.5 py-1 font-[family-name:var(--font-mono)] text-[13px] font-semibold text-txt outline-none placeholder:text-txt-4/75 focus:bg-card focus-visible:shadow-[inset_0_0_0_1px_var(--acc-line)] disabled:opacity-100 aria-[invalid=true]:text-red" />
          <AgentSelect seat={s.seat} agent={agent} agents={agents} onPick={(a) => onPatch({ agent: a })} />
          <span className="flex-1" />
          {lead ? (
            // The server seats the coordinator on the device that starts the mission, whatever its OS.
            <span title={t("lead_device_title")} className="inline-flex h-7 items-center gap-1.5 rounded-[8px] bg-[color-mix(in_srgb,var(--acc)_16%,transparent)] px-[10px] text-[11.5px] font-bold text-txt-2">
              <Icon name="lock" size={11} className="h-[11px] w-[11px] [flex:0_0_11px] text-acc" />{t("lead_device")}
            </span>
          ) : (
            <>
              <DevicePicker seat={s} onPick={(os) => onPatch({ os })} />
              <button type="button" aria-label={t("remove_seat", { seat: s.seat || "-" })} title={t("remove_seat", { seat: s.seat || "-" })} onClick={onRemove}
                className={cn("flex h-7 w-7 items-center justify-center rounded-[8px] text-txt-4 hover:bg-red-soft hover:text-red", FOCUS_RING)}>
                <Icon name="x" size={13} className="h-[13px] w-[13px] [flex:0_0_13px]" />
              </button>
            </>
          )}
        </div>
        <textarea aria-label={t("brief_for", { seat: s.seat || "-" })} rows={2} value={s.brief} maxLength={MISSION_LIMITS.briefChars} placeholder={t("brief_placeholder")}
          onChange={(e) => onPatch({ brief: e.target.value })}
          className="block w-full resize-none rounded-[8px] border-none bg-transparent pt-0.5 pr-1.5 pb-0.5 pl-10 text-[12.5px] leading-[1.55] text-txt-3 outline-none placeholder:text-txt-4/75 focus:text-txt-2 focus-visible:shadow-[inset_0_0_0_1px_var(--acc-line)]" />
      </div>
    </li>
  );
}

export function SeatList({ seats, setSeats, agentOf, agents }: {
  seats: SeatDraft[]; setSeats: (f: (s: SeatDraft[]) => SeatDraft[]) => void; agentOf: (s: SeatDraft, index: number) => string | null; agents: readonly ApiAgent[] | undefined;
}) {
  const t = useTranslations("missions.start");
  const allPresets = useSeatPresets();
  const uid = useRef(Math.max(0, ...seats.map((s) => s.id)));
  const add = (p: SeatPreset | null) => setSeats((s) => [...s, { id: ++uid.current, agent: null, ...(p ?? { seat: "", os: "any", brief: "" }) }]);
  const full = seats.length >= MAX_RECIPIENTS;
  const presets = full ? [] : allPresets.filter((p) => !seats.some((s) => s.seat === p.seat));
  return (
    <div className="flex flex-col gap-[10px]">
      <div className="flex items-baseline gap-[10px]">
        <span className="text-[15px] font-bold text-txt">{t("seats")}</span>
        <span className="text-[11.5px] text-txt-4">{t("seats_note")}</span>
      </div>
      <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
        {seats.map((s, i) => (
          <SeatCard key={s.id} seat={s} index={i} agent={agentOf(s, i)} agents={agents}
            onPatch={(p) => setSeats((all) => all.map((x) => (x.id === s.id ? { ...x, ...p } : x)))}
            onRemove={() => setSeats((all) => all.filter((x) => x.id !== s.id))} />
        ))}
      </ul>
      <div className="flex flex-wrap items-center gap-1.5">
        {full ? <span className="text-[11.5px] text-txt-4">{t("seats_full", { max: MAX_RECIPIENTS })}</span> : (
          <button type="button" onClick={() => add(null)}
            className={cn("inline-flex h-8 items-center gap-1.5 rounded-[10px] bg-card-2 px-3 text-[12.5px] font-bold text-txt-2 hover:bg-card-3 hover:text-txt", FOCUS_RING)}>
            <Icon name="plus" size={12} className="h-3 w-3 [flex:0_0_12px]" /> {t("add_seat")}
          </button>
        )}
        {presets.map((p) => (
          <button key={p.seat} type="button" onClick={() => add(p)} aria-label={t("add_preset", { seat: p.seat })}
            className={cn("inline-flex h-8 items-center rounded-[10px] px-3 font-[family-name:var(--font-mono)] text-[11.5px] text-txt-3 hover:bg-card-2 hover:text-txt", FOCUS_RING)}>
            + {p.seat}
          </button>
        ))}
      </div>
    </div>
  );
}
