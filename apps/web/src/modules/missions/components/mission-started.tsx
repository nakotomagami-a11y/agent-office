"use client";

import { useState } from "react";
import type { SeatOs } from "@agent-office/domain/config/missions";
import type { PendingClaim, SeatView } from "@agent-office/domain/types";
import { cn } from "@/lib/cn";
import { useMission, useMissionActions } from "../hooks/use-missions";
import { deviceName, errorHint, ExternalLink, FOCUS_RING } from "./mission-fields";

export interface StartedMission {
  missionId: string;
  pr: number;
  url: string;
  title: string;
  /** What was submitted: shown until the first fold from GitHub arrives. */
  seats: Array<{ seat: string; os: SeatOs }>;
}

function seatStatus(s: Pick<SeatView, "mine" | "device"> | null, claim: PendingClaim | undefined, lead: boolean): { text: string; tone: string } {
  if (!s) return lead ? { text: "starting on this device", tone: "text-txt-4" } : { text: "waiting for a claim", tone: "text-txt-4" };
  if (s.mine) return { text: "running on this device", tone: "text-green" };
  if (s.device) return { text: `accepted · ${s.device}`, tone: "text-green" };
  if (claim) return { text: `${claim.device} wants this seat`, tone: "text-amber" };
  return { text: "waiting for a claim", tone: "text-txt-4" };
}

export function MissionStarted({ mission, onStartAnother }: { mission: StartedMission; onStartAnother: () => void }) {
  const { data, isLoading, error: loadError } = useMission(mission.missionId);
  const { decideClaim } = useMissionActions(mission.missionId);
  const [error, setError] = useState<string | null>(null);
  const rows: Array<SeatView | StartedMission["seats"][number]> = data?.seats ?? mission.seats;
  const decide = (claimId: number, accept: boolean) => {
    setError(null);
    decideClaim.mutate({ claimId, accept }, { onError: (e) => setError(errorHint(e)) });
  };
  const note = error ?? (loadError ? `Could not read the mission from GitHub: ${errorHint(loadError)}` : isLoading ? "Reading the mission from GitHub…" : "");

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-[14px] overflow-y-auto px-[22px] pt-[22px] pb-5">
      <div className="flex items-center gap-[10px]">
        <span className="h-2 w-2 rounded-full bg-green shadow-[0_0_10px_var(--green)]" />
        <span className="text-[15px] font-extrabold tracking-[-0.01em] text-txt">{data?.title ?? mission.title}</span>
        <ExternalLink href={mission.url} className="font-[family-name:var(--font-mono)] text-[11px] text-acc hover:text-txt">draft PR #{mission.pr}</ExternalLink>
      </div>
      <span className="text-[12px] leading-[1.55] text-txt-3">
        The coordinator is running here. Other seats are waiting for a device to claim them. Claims show up below for you to accept.
      </span>
      <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
        {rows.map((s, i) => {
          const live = "mine" in s ? s : null;
          const claim = data?.claims.find((c) => c.seat === s.seat);
          const status = seatStatus(live, claim, i === 0);
          return (
            <li key={s.seat} className="flex items-center gap-3 rounded-[12px] border border-edge bg-card-2 px-3 py-[10px]">
              <span className="w-[120px] truncate font-[family-name:var(--font-mono)] text-[12.5px] text-txt">{s.seat}</span>
              <span className="w-[110px] text-[11px] text-txt-4">{deviceName(s.os)}</span>
              <span className={cn("flex-1 text-[11.5px]", status.tone)}>{status.text}</span>
              {claim && live && !live.device && data?.leadHere && (
                <div className="flex gap-1.5">
                  <button type="button" disabled={decideClaim.isPending} onClick={() => decide(claim.commentId, false)} aria-label={`Decline ${claim.device} for ${s.seat}`}
                    className={cn("rounded-[9px] px-[11px] py-1.5 text-[11.5px] font-bold text-txt-3 hover:text-red disabled:opacity-50", FOCUS_RING)}>Decline</button>
                  <button type="button" disabled={decideClaim.isPending} onClick={() => decide(claim.commentId, true)} aria-label={`Accept ${claim.device} for ${s.seat}`}
                    className={cn("rounded-[9px] bg-acc-2 px-3 py-1.5 text-[11.5px] font-extrabold text-white hover:bg-acc disabled:opacity-50", FOCUS_RING)}>Accept</button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
      <div className="flex items-center gap-3">
        <span aria-live="polite" className={cn("flex-1 text-[11.5px]", error || loadError ? "text-red" : "text-txt-4")}>{note}</span>
        <button type="button" onClick={onStartAnother} className={cn("rounded-[6px] text-[11.5px] font-bold text-txt-4 hover:text-txt", FOCUS_RING)}>
          Start another mission
        </button>
      </div>
    </div>
  );
}
