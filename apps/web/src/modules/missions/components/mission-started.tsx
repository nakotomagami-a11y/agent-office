"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { COORDINATOR_SEAT, type SeatOs } from "@agent-office/domain/config/missions";
import type { SeatView } from "@agent-office/domain/types";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/cn";
import { useOfficeStore } from "@/modules/office/hooks/use-office-store";
import { startedSeatStatus } from "../format/seat-status";
import { useMissionErrorText } from "../hooks/use-mission-error";
import { useMission, useMissionActions } from "../hooks/use-missions";
import { CTA_FILL, DOT, ExternalLink, FOCUS_RING, TONE } from "./mission-fields";

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
        className={cn("inline-flex h-[30px] items-center rounded-[9px] px-3 text-[12px] font-bold text-txt-3 hover:bg-red-soft hover:text-red disabled:opacity-50", FOCUS_RING)}>{t("decline")}</button>
      <button type="button" disabled={busy} onClick={() => onDecide(true)} aria-label={t("accept_aria", { device, seat })}
        className={cn("inline-flex h-[30px] min-w-[76px] items-center justify-center rounded-[9px] px-3 text-[12px] font-extrabold hover:brightness-90 disabled:opacity-50", CTA_FILL, FOCUS_RING)}>{t("accept")}</button>
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
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-6 pt-4 pb-5 motion-safe:animate-[lrIn_260ms_ease_both]">
      <div className="flex items-center gap-[14px] rounded-[16px] bg-green-soft px-[18px] py-4">
        <span aria-hidden className={cn("h-2.5 w-2.5 shrink-0 rounded-full", DOT.ok)} />
        <div className="flex min-w-0 flex-1 flex-col gap-[3px]">
          <span className="flex min-w-0 items-baseline gap-[10px]">
            <span className="truncate text-[17px] font-extrabold tracking-[-0.02em] text-txt">{data?.title ?? mission.title}</span>
            <ExternalLink href={mission.url} className="shrink-0 whitespace-nowrap font-[family-name:var(--font-mono)] text-[11.5px] text-acc-2 dark:text-acc hover:text-txt">
              {t("started.pr_link", { pr: mission.pr })}<Icon name="external-link" size={11} className="ml-1 inline h-[11px] w-[11px] align-[-1px]" />
            </ExternalLink>
          </span>
          <span className="text-[12.5px] leading-[1.5] text-txt-2">{t("started.intro")}</span>
        </div>
        <button type="button" onClick={openChat}
          className={cn("inline-flex h-[34px] shrink-0 items-center gap-[7px] whitespace-nowrap rounded-[10px] bg-card px-[14px] text-[12.5px] font-bold text-txt hover:bg-card-3", FOCUS_RING)}>
          {t("started.open_chat")}<Icon name="chevron" size={12} className="h-3 w-3 [flex:0_0_12px]" />
        </button>
      </div>
      <ul className="m-0 flex list-none flex-col p-0">
        {rows.map((s, i) => {
          const lead = s.seat === COORDINATOR_SEAT;
          const live = "mine" in s ? s : null;
          const claim = data?.claims.find((c) => c.seat === s.seat);
          const status = startedSeatStatus(live, claim, lead);
          return (
            <li key={s.seat} className={cn("flex min-h-[52px] items-center gap-3 rounded-[12px] px-3 py-1.5", i % 2 === 1 && "bg-[color-mix(in_srgb,var(--txt)_2.5%,transparent)]")}>
              <span aria-hidden className={cn("h-2 w-2 shrink-0 rounded-full", DOT[status.tone])} />
              <span className="w-[130px] truncate font-[family-name:var(--font-mono)] text-[13px] font-semibold text-txt">{s.seat}</span>
              <span className="w-[110px] text-[12px] text-txt-4">{lead ? t("start.lead_device") : t(`device.${s.os}`)}</span>
              <span className={cn("flex-1 text-[12.5px]", TONE[status.tone])}>{t(`started.status.${status.key}`, { device: status.device ?? "" })}</span>
              {claim && live && !live.device && data?.leadHere && (
                <ClaimButtons device={claim.device} seat={s.seat} busy={decideClaim.isPending} onDecide={(accept) => decide(claim.commentId, accept)} />
              )}
            </li>
          );
        })}
      </ul>
      <div className="flex items-center gap-3">
        <span aria-live="polite" className={cn("flex-1 text-[11.5px]", error || loadError ? "text-red" : "text-txt-4")}>{note}</span>
        <button type="button" onClick={onStartAnother} className={cn("rounded-[6px] text-[12px] font-bold text-txt-4 hover:text-txt", FOCUS_RING)}>
          {t("started.start_another")}
        </button>
      </div>
    </div>
  );
}
