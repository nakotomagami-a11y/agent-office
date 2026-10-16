"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { COORDINATOR_SEAT, type SeatOs } from "@agent-office/domain/config/missions";
import type { SeatView } from "@agent-office/domain/types";
import { cn } from "@/lib/cn";
import { useOfficeStore } from "@/modules/office/hooks/use-office-store";
import { startedSeatStatus } from "../format/seat-status";
import { useMissionErrorText } from "../hooks/use-mission-error";
import { useMission, useMissionActions } from "../hooks/use-missions";
import { ExternalLink, FOCUS_RING, TONE } from "./mission-fields";

export interface StartedMission {
  missionId: string;
  pr: number;
  url: string;
  title: string;
  /** The coordinator's chat on this device. */
  instanceId: string;
  coordinatorAgent: string;
  /** What was submitted: shown until the first fold from GitHub arrives. */
  seats: Array<{ seat: string; os: SeatOs }>;
}

function ClaimButtons({ device, seat, busy, onDecide }: { device: string; seat: string; busy: boolean; onDecide: (accept: boolean) => void }) {
  const t = useTranslations("missions.started");
  return (
    <div className="flex gap-1.5">
      <button type="button" disabled={busy} onClick={() => onDecide(false)} aria-label={t("decline_aria", { device, seat })}
        className={cn("rounded-[9px] px-[11px] py-1.5 text-[11.5px] font-bold text-txt-3 hover:text-red disabled:opacity-50", FOCUS_RING)}>{t("decline")}</button>
      <button type="button" disabled={busy} onClick={() => onDecide(true)} aria-label={t("accept_aria", { device, seat })}
        className={cn("rounded-[9px] bg-acc-cta px-3 py-1.5 text-[11.5px] font-extrabold text-acc-ink hover:bg-acc-2 disabled:opacity-50", FOCUS_RING)}>{t("accept")}</button>
    </div>
  );
}

export function MissionStarted({ mission, projectId, active, onLeave, onStartAnother }: {
  mission: StartedMission; projectId: string; active: boolean; onLeave: () => void; onStartAnother: () => void;
}) {
  const t = useTranslations("missions");
  const errorText = useMissionErrorText();
  const selectAgent = useOfficeStore((s) => s.select);
  const { data, isLoading, error: loadError } = useMission(mission.missionId, active);
  const { decideClaim } = useMissionActions(mission.missionId, projectId);
  const [error, setError] = useState<string | null>(null);
  const rows: Array<SeatView | StartedMission["seats"][number]> = data?.seats ?? mission.seats;
  const decide = (claimId: number, accept: boolean) => {
    setError(null);
    decideClaim.mutate({ claimId, accept }, { onError: (e) => setError(errorText(e)) });
  };
  const openChat = () => {
    onLeave();
    selectAgent(mission.coordinatorAgent, { instanceId: mission.instanceId, tab: "conversation" });
  };
  const note = error ?? (loadError ? t("started.load_failed", { reason: errorText(loadError) }) : isLoading ? t("started.loading") : "");

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-[14px] overflow-y-auto px-[22px] pt-[22px] pb-5">
      <div className="flex items-center gap-[10px]">
        <span aria-hidden className="h-2 w-2 rounded-full bg-green shadow-[0_0_10px_var(--green)]" />
        <span className="text-[15px] font-extrabold tracking-[-0.01em] text-txt">{data?.title ?? mission.title}</span>
        <ExternalLink href={mission.url} className="font-[family-name:var(--font-mono)] text-[11px] text-acc hover:text-txt">{t("started.pr_link", { pr: mission.pr })}</ExternalLink>
        <span className="flex-1" />
        <button type="button" onClick={openChat}
          className={cn("rounded-[10px] border border-edge-2 bg-card-3 px-3 py-[7px] text-[12px] font-bold text-txt hover:border-acc-line", FOCUS_RING)}>
          {t("started.open_chat")}
        </button>
      </div>
      <span className="text-[12px] leading-[1.55] text-txt-3">{t("started.intro")}</span>
      <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
        {rows.map((s) => {
          const lead = s.seat === COORDINATOR_SEAT;
          const live = "mine" in s ? s : null;
          const claim = data?.claims.find((c) => c.seat === s.seat);
          const status = startedSeatStatus(live, claim, lead);
          return (
            <li key={s.seat} className="flex items-center gap-3 rounded-[12px] border border-edge bg-card-2 px-3 py-[10px]">
              <span className="w-[120px] truncate font-[family-name:var(--font-mono)] text-[12.5px] text-txt">{s.seat}</span>
              <span className="w-[110px] text-[11px] text-txt-4">{lead ? t("start.lead_device") : t(`device.${s.os}`)}</span>
              <span className={cn("flex-1 text-[11.5px]", TONE[status.tone])}>{t(`started.status.${status.key}`, { device: status.device ?? "" })}</span>
              {claim && live && !live.device && data?.leadHere && (
                <ClaimButtons device={claim.device} seat={s.seat} busy={decideClaim.isPending} onDecide={(accept) => decide(claim.commentId, accept)} />
              )}
            </li>
          );
        })}
      </ul>
      <div className="flex items-center gap-3">
        <span aria-live="polite" className={cn("flex-1 text-[11.5px]", error || loadError ? "text-red" : "text-txt-4")}>{note}</span>
        <button type="button" onClick={onStartAnother} className={cn("rounded-[6px] text-[11.5px] font-bold text-txt-4 hover:text-txt", FOCUS_RING)}>
          {t("started.start_another")}
        </button>
      </div>
    </div>
  );
}
