"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Icon } from "@/components/ui/icon";
import { useMission, useMissionSeat } from "../hooks/use-missions";
import { MissionPanel } from "./mission-panel";

/**
 * Chat-header affordance for a mission seat (docs/missions.md, "UI"): LoopPill's shape — a compact
 * trigger, a panel on click. Renders nothing for a chat that is no mission seat. The count is what
 * waits on the human ON THIS DEVICE: claims (lead only) and questions.
 */
export function MissionPill({ instanceId }: { instanceId: string | undefined }) {
  const { data: seatData } = useMissionSeat(instanceId);
  const seat = seatData?.seat ?? null;
  const { data: mission, error } = useMission(seat?.missionId ?? null);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();

  // Outside-click AND Escape, as LoopPill: a panel a keyboard user cannot dismiss is a trap.
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { setOpen(false); triggerRef.current?.focus(); }
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!seat) return null;
  const waiting = (mission?.claims.length ?? 0) + (mission?.asks.length ?? 0);
  const alarm = !!mission?.alarm;

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        ref={triggerRef}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={`Mission ${mission?.title ?? ""}, seat ${seat.seat}${waiting ? `, ${waiting} waiting on you` : ""}${alarm ? ", routing stopped" : ""}`}
        className={`inline-flex items-center gap-[7px] h-7 px-[10px] rounded-lg border text-[12.5px] transition-[background,color,border-color] duration-[120ms] hover:bg-ao-bg-4 hover:text-ao-fg-0 ${
          alarm ? "bg-ao-bg-3 border-ao-red text-ao-red" : "bg-ao-bg-3 border-ao-line-1 text-ao-fg-1 hover:border-ao-line-2"
        }`}
      >
        <Icon name={alarm ? "alert-circle" : "users"} className="w-3.5 h-3.5" />
        <span className="max-w-[160px] truncate">{mission?.title ?? "Mission"}</span>
        <span className="text-ao-fg-2">{seat.seat}</span>
        {waiting > 0 && <span className="px-1.5 rounded bg-ao-acc text-ao-bg-1">{waiting}</span>}
      </button>

      {open && (
        <div id={panelId} className="absolute right-0 z-30 mt-1.5 w-[460px] rounded-xl border border-ao-line-1 bg-ao-bg-2 p-3 shadow-lg">
          {mission ? <MissionPanel mission={mission} /> : (
            <p className="text-[12px] text-ao-fg-2">{error ? "Could not read the mission hub." : "Reading the mission hub…"}</p>
          )}
        </div>
      )}
    </div>
  );
}
