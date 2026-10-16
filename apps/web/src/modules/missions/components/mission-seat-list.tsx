"use client";

import { useRef } from "react";
import { useTranslations } from "next-intl";
import { MAX_RECIPIENTS, MISSION_LIMITS, SEAT_OS, type SeatOs } from "@agent-office/domain/config/missions";
import { Icon } from "@/components/ui/icon";
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
      className="flex gap-[2px] rounded-[9px] border border-edge bg-card p-[2px]">
      {SEAT_OS.map((os) => (
        <button key={os} type="button" role="radio" data-value={os} aria-checked={s.os === os} tabIndex={s.os === os ? 0 : -1} onClick={() => onPick(os)}
          className={cn("rounded-[7px] px-[9px] py-1 text-[11px] font-bold transition-all duration-[120ms] hover:text-txt", FOCUS_RING,
            s.os === os ? "bg-card-3 text-txt" : "text-txt-4")}>
          {t(`os.${os}`)}
        </button>
      ))}
    </div>
  );
}

function AgentSelect({ seat, agent, installed, onPick }: { seat: string; agent: string | null; installed: readonly string[] | undefined; onPick: (a: string) => void }) {
  const t = useTranslations("missions.start");
  const ok = agentInstalled(agent, installed);
  const options = installed ? (agent && !ok ? [agent, ...installed] : installed) : [];
  const empty = !installed ? t("agents_loading") : installed.length === 0 ? t("agents_none") : null;
  return (
    <select aria-label={t("agent_for", { seat: seat || "-" })} value={agent ?? ""} onChange={(e) => onPick(e.target.value)}
      aria-invalid={(installed !== undefined && !ok) || undefined} title={installed && agent && !ok ? t("agent_missing", { agent }) : undefined}
      className={cn("h-7 max-w-[140px] cursor-pointer rounded-[8px] border bg-card-3 px-2 text-[11.5px] font-semibold text-txt-2 outline-none focus:border-acc-line",
        installed !== undefined && !ok ? "border-red" : "border-edge")}>
      {empty && <option value="" disabled>{empty}</option>}
      {options.map((a) => <option key={a} value={a}>{installed?.includes(a) ? a : t("agent_missing", { agent: a })}</option>)}
    </select>
  );
}

function SeatCard({ seat: s, index, agent, installed, onPatch, onRemove }: {
  seat: SeatDraft; index: number; agent: string | null; installed: readonly string[] | undefined; onPatch: (p: Partial<SeatDraft>) => void; onRemove: () => void;
}) {
  const t = useTranslations("missions.start");
  const lead = index === 0;
  return (
    <li>
      <div role="group" aria-label={s.seat || t("seat_n", { n: index + 1 })} className="rounded-[14px] border border-edge bg-card-2 shadow-[var(--inset-hi)]">
        <div className="flex flex-wrap items-center gap-2 pt-2 pr-2 pl-3">
          <span className="w-4 font-[family-name:var(--font-mono)] text-[10px] text-txt-4">{String(index + 1).padStart(2, "0")}</span>
          <input aria-label={t("seat_name")} value={s.seat} disabled={lead} placeholder={t("seat_name_placeholder")} aria-invalid={!seatNameOk(s.seat) || undefined}
            onChange={(e) => onPatch({ seat: seatName(e.target.value) })}
            className="w-[130px] rounded-[8px] border border-transparent bg-transparent px-2 py-1.5 font-[family-name:var(--font-mono)] text-[12.5px] font-medium text-txt outline-none placeholder:text-txt-4/75 enabled:hover:border-edge-2 focus:border-acc-line focus:bg-card disabled:opacity-100" />
          <AgentSelect seat={s.seat} agent={agent} installed={installed} onPick={(a) => onPatch({ agent: a })} />
          <span className="flex-1" />
          {lead ? (
            // The server seats the coordinator on the device that starts the mission, whatever its OS.
            <span title={t("lead_device_title")} className="flex items-center gap-1.5 px-1 text-[11px] font-bold text-txt-3">
              {t("lead_device")}<Icon name="lock" size={12} className="text-txt-4" />
            </span>
          ) : (
            <>
              <DevicePicker seat={s} onPick={(os) => onPatch({ os })} />
              <button type="button" aria-label={t("remove_seat", { seat: s.seat || "-" })} title={t("remove_seat", { seat: s.seat || "-" })} onClick={onRemove}
                className={cn("flex h-7 w-7 items-center justify-center rounded-[8px] text-txt-4 hover:bg-red-soft hover:text-red", FOCUS_RING)}>
                <Icon name="x" size={13} />
              </button>
            </>
          )}
        </div>
        <textarea aria-label={t("brief_for", { seat: s.seat || "-" })} rows={2} value={s.brief} maxLength={MISSION_LIMITS.briefChars} placeholder={t("brief_placeholder")}
          onChange={(e) => onPatch({ brief: e.target.value })}
          className="block w-full resize-none rounded-b-[14px] border-none bg-transparent pt-1.5 pr-[14px] pb-[11px] pl-11 text-[12.5px] leading-[1.55] text-txt-2 outline-none placeholder:text-txt-4/75 focus-visible:shadow-[inset_0_0_0_1px_var(--acc-line)]" />
      </div>
    </li>
  );
}

export function SeatList({ seats, setSeats, agentOf, installed }: {
  seats: SeatDraft[]; setSeats: (f: (s: SeatDraft[]) => SeatDraft[]) => void; agentOf: (s: SeatDraft, index: number) => string | null; installed: readonly string[] | undefined;
}) {
  const t = useTranslations("missions.start");
  const allPresets = useSeatPresets();
  const uid = useRef(Math.max(0, ...seats.map((s) => s.id)));
  const add = (p: SeatPreset | null) => setSeats((s) => [...s, { id: ++uid.current, agent: null, ...(p ?? { seat: "", os: "any", brief: "" }) }]);
  const full = seats.length >= MAX_RECIPIENTS;
  const presets = full ? [] : allPresets.filter((p) => !seats.some((s) => s.seat === p.seat));
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline gap-[10px]">
        <span className="text-[12.5px] font-bold text-txt">{t("seats")}</span>
        <span className="text-[11px] text-txt-4">{t("seats_note")}</span>
      </div>
      <ul className="m-0 flex list-none flex-col gap-2 p-0">
        {seats.map((s, i) => (
          <SeatCard key={s.id} seat={s} index={i} agent={agentOf(s, i)} installed={installed}
            onPatch={(p) => setSeats((all) => all.map((x) => (x.id === s.id ? { ...x, ...p } : x)))}
            onRemove={() => setSeats((all) => all.filter((x) => x.id !== s.id))} />
        ))}
      </ul>
      <div className="flex flex-wrap items-center gap-1.5">
        {full ? <span className="text-[11px] text-txt-4">{t("seats_full", { max: MAX_RECIPIENTS })}</span> : (
          <button type="button" onClick={() => add(null)}
            className={cn("flex items-center gap-1.5 rounded-[10px] border border-dashed border-edge-2 px-3 py-[7px] text-[12px] font-bold text-txt-3 hover:border-acc-line hover:text-txt", FOCUS_RING)}>
            <Icon name="plus" size={12} /> {t("add_seat")}
          </button>
        )}
        {presets.map((p) => (
          <button key={p.seat} type="button" onClick={() => add(p)} aria-label={t("add_preset", { seat: p.seat })}
            className={cn("rounded-[10px] border border-edge bg-card-2 px-[11px] py-[7px] font-[family-name:var(--font-mono)] text-[11px] text-txt-3 hover:border-edge-2 hover:text-txt", FOCUS_RING)}>
            + {p.seat}
          </button>
        ))}
      </div>
    </div>
  );
}
