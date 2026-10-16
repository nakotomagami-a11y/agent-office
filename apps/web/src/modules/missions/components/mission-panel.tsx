"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { CAP_STEP_USD, COORDINATOR_SEAT } from "@agent-office/domain/config/missions";
import type { MissionView, SeatView } from "@agent-office/domain/types";
import { useMissionErrorText } from "../hooks/use-mission-error";
import { useMissionActions } from "../hooks/use-missions";
import { ExternalLink, useUsd } from "./mission-fields";
import { Action, AskItem, ConfirmAction, Section } from "./mission-panel-controls";

type Actions = ReturnType<typeof useMissionActions>;
type Callbacks = { onError: (e: unknown) => void; onSuccess: () => void };

function SeatRow({ mission, seat: s, a, on }: { mission: MissionView; seat: SeatView; a: Actions; on: Callbacks }) {
  const t = useTranslations("missions.panel");
  const steer = mission.leadHere && !mission.closed && s.seat !== COORDINATOR_SEAT;
  return (
    <li className="flex flex-wrap items-center gap-2">
      <code className="text-txt">{s.seat}</code>
      <span className="text-txt-3">{s.agent}</span>
      <span className="ml-auto truncate text-txt-3">{s.device ? (s.mine ? t("device_here", { device: s.device }) : s.device) : t("seat_open")}</span>
      {s.paused && <span className="rounded border border-edge-2 bg-card-3 px-1.5 text-txt-2">{t("paused")}</span>}
      {steer && s.device && (
        <Action label={s.paused ? t("resume") : t("pause")} ariaLabel={t(s.paused ? "resume_aria" : "pause_aria", { seat: s.seat })} busy={a.act.isPending}
          onClick={() => a.act.mutate({ act: s.paused ? "resume" : "pause", seats: [s.seat] }, on)} />
      )}
      {/* A device that vanished holds its seat forever; the lead frees it for another claim. */}
      {steer && s.device && !s.mine && (
        <ConfirmAction label={t("evict")} confirmLabel={t("evict_confirm", { seat: s.seat })} ariaLabel={t("evict_aria", { seat: s.seat })}
          warning={t("evict_warning", { seat: s.seat, device: s.device })} busy={a.act.isPending}
          onConfirm={() => a.act.mutate({ act: "evict", seats: [s.seat] }, on)} />
      )}
    </li>
  );
}

function LocalSeats({ mission, a, on }: { mission: MissionView; a: Actions; on: Callbacks }) {
  const t = useTranslations("missions.panel");
  const usd = useUsd();
  return (
    <Section title={t("on_this_device")}>
      {mission.local.map((l) => (
        <li key={l.seat} className="flex flex-wrap items-center gap-2">
          <code className="text-txt">{l.seat}</code>
          <span className="text-txt-3">{l.accepted ? t("spent", { spent: usd(l.spentUsd), cap: usd(l.capUsd) }) : t("waiting_accept")}</span>
          {l.needsAttention && <span className="text-red">{t("needs_attention")}</span>}
          {l.accepted && (
            <span className="ml-auto">
              <Action label={t("allow_more", { amount: usd(CAP_STEP_USD) })} ariaLabel={t("allow_more_aria", { amount: usd(CAP_STEP_USD), seat: l.seat })}
                busy={a.raiseCap.isPending} onClick={() => a.raiseCap.mutate({ seat: l.seat, byUsd: CAP_STEP_USD }, on)} />
            </span>
          )}
          {l.seat !== COORDINATOR_SEAT && (
            <ConfirmAction label={t("leave")} confirmLabel={t("leave_confirm", { seat: l.seat })} ariaLabel={t("leave_aria", { seat: l.seat })}
              warning={t("leave_warning", { seat: l.seat })} busy={a.leave.isPending}
              onConfirm={() => a.leave.mutate({ seat: l.seat, instanceId: l.instanceId }, on)} />
          )}
        </li>
      ))}
    </Section>
  );
}

function Alarm({ mission }: { mission: MissionView }) {
  const t = useTranslations("missions.panel");
  if (!mission.alarm) return null;
  return (
    <p role="alert" className="rounded-lg border border-red p-2 text-red">
      {t(`alarm.${mission.alarm}`)}
      {mission.forged.length > 0 && (
        <> {t("forged_comments")} {mission.forged.map((id) => (
          <ExternalLink key={id} href={`${mission.url}#issuecomment-${id}`} className="underline"> #{id}</ExternalLink>
        ))}</>
      )}
    </p>
  );
}

/** `drafts`: unsent answers by ask comment id, owned by whoever outlives this panel. */
export function MissionPanel({ mission, drafts }: { mission: MissionView; drafts: Map<number, string> }) {
  const t = useTranslations("missions.panel");
  const a = useMissionActions(mission.missionId, mission.projectId);
  const errorText = useMissionErrorText();
  const [error, setError] = useState<string | null>(null);
  const on: Callbacks = { onError: (e) => setError(errorText(e)), onSuccess: () => setError(null) };

  return (
    <div className="flex flex-col gap-3 text-[12px]">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-[13px] text-txt">{mission.title}</p>
        <ExternalLink href={mission.url} className="shrink-0 text-txt-3 underline hover:text-txt">{t("pr_link", { pr: mission.pr })}</ExternalLink>
      </div>
      {mission.closed && <p className="text-txt-3">{t("closed")}</p>}
      <Alarm mission={mission} />

      <Section title={t("seats")}>
        {mission.seats.map((s) => <SeatRow key={s.seat} mission={mission} seat={s} a={a} on={on} />)}
      </Section>

      {mission.claims.length > 0 && (
        <Section title={t("claims")}>
          {mission.claims.map((c) => (
            <li key={c.commentId} className="flex items-center gap-2">
              <span className="text-txt">{t("claim_wants", { device: c.device, seat: c.seat })}</span>
              <span className="ml-auto flex gap-1.5">
                <Action label={t("accept")} ariaLabel={t("accept_aria", { device: c.device, seat: c.seat })} busy={a.decideClaim.isPending}
                  onClick={() => a.decideClaim.mutate({ claimId: c.commentId, accept: true }, on)} />
                <Action label={t("reject")} ariaLabel={t("reject_aria", { device: c.device, seat: c.seat })} busy={a.decideClaim.isPending}
                  onClick={() => a.decideClaim.mutate({ claimId: c.commentId, accept: false }, on)} />
              </span>
            </li>
          ))}
        </Section>
      )}

      {mission.asks.length > 0 && (
        <Section title={t("questions")}>
          {mission.asks.map((q) => <AskItem key={q.commentId} ask={q} busy={a.answer.isPending} drafts={drafts}
            onAnswer={(text, posted) => a.answer.mutate({ askId: q.commentId, text }, { ...on, onSuccess: () => { on.onSuccess(); posted(); } })} />)}
        </Section>
      )}

      <LocalSeats mission={mission} a={a} on={on} />

      {mission.leadHere && !mission.closed && (
        <div className="flex flex-wrap items-center gap-2">
          <ConfirmAction label={t("close_mission")} confirmLabel={t("close_confirm")} warning={t("close_warning")} busy={a.act.isPending}
            onConfirm={() => a.act.mutate({ act: "close", seats: [] }, on)} />
        </div>
      )}
      {error && <p role="alert" className="text-red">{error}</p>}
    </div>
  );
}
