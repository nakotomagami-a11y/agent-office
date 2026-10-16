"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/cn";
import { useMission, useMissionSeat } from "../hooks/use-missions";
import { FOCUS_RING } from "./mission-fields";
import { MissionPanel } from "./mission-panel";

/**
 * Chat-header affordance for a mission seat (docs/missions.md, "UI"): LoopPill's shape — a compact
 * trigger, a panel on click. Renders nothing for a chat that is no mission seat. The count is what
 * waits on the human ON THIS DEVICE: claims (lead only) and questions.
 */
export function MissionPill({ instanceId }: { instanceId: string | undefined }) {
  const t = useTranslations("missions.pill");
  const { data: seatData } = useMissionSeat(instanceId);
  const seat = seatData?.seat ?? null;
  const { data: mission, error } = useMission(seat?.missionId ?? null);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();
  // Answers being typed outlive the panel: it unmounts on every outside click or Escape.
  const [drafts] = useState(() => new Map<number, string>());

  // Outside-click AND Escape, as LoopPill: a panel a keyboard user cannot dismiss is a trap.
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      // An IME's Escape cancels a composition; an Escape typed elsewhere belongs to whatever has focus.
      if (e.key !== "Escape" || e.isComposing || e.keyCode === 229 || !ref.current?.contains(document.activeElement)) return;
      // Capture phase, and no further: the inspector around this pill closes on Escape too.
      e.preventDefault();
      e.stopImmediatePropagation();
      setOpen(false);
      triggerRef.current?.focus();
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [open]);

  if (!seat) return null;
  const waiting = (mission?.claims.length ?? 0) + (mission?.asks.length ?? 0);
  const alarm = !!mission?.alarm;
  const label = mission
    ? t("aria", { title: mission.title, seat: seat.seat, waiting, alarm: String(alarm) })
    : t("aria_loading", { seat: seat.seat });

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        ref={triggerRef}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={label}
        className={cn(
          "inline-flex h-7 items-center gap-[7px] rounded-lg border bg-card-3 px-[10px] text-[12.5px] transition-[color,border-color] duration-[120ms] hover:text-txt", FOCUS_RING,
          alarm ? "border-red text-red" : "border-edge-2 text-txt-2 hover:border-line-strong",
        )}
      >
        <Icon name={alarm ? "alert-circle" : "users"} className="h-3.5 w-3.5" />
        <span className="max-w-[160px] truncate">{mission?.title ?? t("fallback_title")}</span>
        <span className="text-txt-3">{seat.seat}</span>
        {waiting > 0 && <span className="rounded bg-acc-cta px-1.5 text-acc-ink">{waiting}</span>}
      </button>

      {open && (
        <div id={panelId} className="absolute right-0 z-30 mt-1.5 w-[460px] max-w-[calc(100vw-24px)] rounded-xl border border-edge-2 bg-card-2 p-3 shadow-[var(--lift)]">
          {mission ? <MissionPanel mission={mission} drafts={drafts} /> : (
            <p className="text-[12px] text-txt-3">{error ? t("load_failed") : t("loading")}</p>
          )}
        </div>
      )}
    </div>
  );
}
