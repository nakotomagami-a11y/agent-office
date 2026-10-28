"use client";

import { useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { COORDINATOR_SEAT, MISSION_LIMITS } from "@agent-office/domain/config/missions";
import { cn } from "@/lib/cn";
import { useAgents } from "@/modules/agents/hooks/use-agents";
import { missionFailure } from "../format/mission-errors";
import { parseUsd, usdOk } from "../format/money";
import { defaultAgent, deviceTypes, missingBits } from "../format/start-form";
import { useMissionErrorText } from "../hooks/use-mission-error";
import { useStartMission, type StartMissionInput } from "../hooks/use-missions";
import { MicroLabel, ModalFooter, MoneyField, PrimaryAction, PublicRepoConfirm, useMoneyNote } from "./mission-fields";
import { SeatList, useSeatPresets, type SeatDraft } from "./mission-seat-list";
import type { StartedMission } from "./mission-started";

/** The one template (docs/missions.md, D7): measure on every device, cross-check, design, synthesise,
 *  then build only after the human approves. Every field stays editable. */
function useCrossDevice(): SeatDraft[] {
  const t = useTranslations("missions.start");
  const presets = useSeatPresets();
  return [
    { id: 1, seat: COORDINATOR_SEAT, agent: null, os: "any", brief: t("coordinator_brief") },
    ...presets.map((p, i) => ({ ...p, id: i + 2, agent: null })),
  ];
}

function useStartFlow(onStarted: (m: StartedMission) => void) {
  const start = useStartMission();
  const errorText = useMissionErrorText();
  const [error, setError] = useState<string | null>(null);
  // The exact request a public repo refused, resent with `allowPublic` once the human confirms.
  const [publicAsk, setPublicAsk] = useState<StartMissionInput | null>(null);
  const send = (input: StartMissionInput) => {
    setError(null);
    setPublicAsk(null);
    start.mutate(input, {
      onSuccess: (r) => onStarted({
        missionId: r.missionId, pr: r.pr, url: r.url, instanceId: r.instanceId, title: input.title.trim(),
        coordinatorAgent: input.seats[0]?.agent ?? "", seats: input.seats.map(({ seat, os }) => ({ seat, os })),
      }),
      onError: (e) => (missionFailure(e).key === "repo_public" ? setPublicAsk(input) : setError(errorText(e))),
    });
  };
  const clear = () => { setError(null); setPublicAsk(null); };
  return { send, clear, error, publicAsk, pending: start.isPending };
}

export function MissionStartForm({ projectId, onStarted }: { projectId: string; onStarted: (m: StartedMission) => void }) {
  const t = useTranslations("missions.start");
  const format = useFormatter();
  const moneyNote = useMoneyNote();
  const template = useCrossDevice();
  const { data: agentList } = useAgents();
  const installed = agentList?.map((a) => a.id);
  const [title, setTitle] = useState("");
  const [goal, setGoal] = useState("");
  const [budget, setBudget] = useState("20");
  const [cap, setCap] = useState("5");
  const [seats, setSeats] = useState<SeatDraft[]>(template);
  const flow = useStartFlow(onStarted);
  const edit = <T,>(set: (v: T) => void) => (v: T) => { flow.clear(); set(v); };

  const agentOf = (s: SeatDraft, i: number) => s.agent ?? (installed ? defaultAgent(i === 0, installed) : null);
  const budgetUsd = parseUsd(budget);
  const capUsd = parseUsd(cap);
  const capOver = usdOk(budgetUsd) && usdOk(capUsd) && capUsd > budgetUsd;
  const resolved = seats.map((s, i) => ({ seat: s.seat, agent: agentOf(s, i) }));
  const missing = missingBits({ title, goal, budgetUsd, capUsd, seats: resolved, installed });
  const ready = missing.length === 0 && !flow.pending && !flow.publicAsk;

  const submit = () => {
    if (!usdOk(budgetUsd) || !usdOk(capUsd)) return;
    flow.send({
      projectId, title: title.trim(), goal, budgetUsd, capUsd,
      // The coordinator runs on this device whatever its OS: the server seats it here.
      seats: seats.map((s, i) => ({ seat: s.seat, agent: agentOf(s, i) ?? "", os: i === 0 ? "any" : s.os, brief: s.brief })),
    });
  };
  const capNote = capOver ? t("cap_over") : moneyNote(cap, usdOk(budgetUsd) && usdOk(capUsd) ? t("cap_share", { share: capUsd / budgetUsd }) : undefined);

  return (
    <>
      <div className="flex min-h-0 flex-1 flex-col gap-[18px] overflow-y-auto px-[22px] pt-[18px] pb-1.5">
        <div className="rounded-[12px] border border-edge bg-card-2 px-[13px] py-[11px] text-[12px] leading-[1.55] text-txt-3 [text-wrap:pretty]">
          {t("intro")} <span className="font-bold text-acc">{t("intro_cheaper")}</span>
        </div>
        <div className="flex flex-col gap-[10px]">
          <input aria-label={t("title_label")} value={title} maxLength={MISSION_LIMITS.titleChars} onChange={(e) => edit(setTitle)(e.target.value)} placeholder={t("title_placeholder")}
            className="w-full rounded-[6px] border-none bg-transparent py-1 text-[20px] font-extrabold tracking-[-0.02em] text-txt outline-none placeholder:text-txt-4/75 focus-visible:shadow-[0_1px_0_var(--acc-line)]" />
          <label className="flex flex-col gap-1.5">
            <MicroLabel>{t("goal_label")}</MicroLabel>
            <textarea rows={3} value={goal} maxLength={MISSION_LIMITS.goalChars} onChange={(e) => edit(setGoal)(e.target.value)} placeholder={t("goal_placeholder")}
              className="w-full resize-y rounded-[12px] border border-edge bg-card-2 px-[13px] py-[11px] text-[13px] leading-[1.55] text-txt outline-none placeholder:text-txt-4/75 focus:border-acc-line" />
          </label>
        </div>
        <div className="flex gap-3">
          <MoneyField label={t("budget_label")} value={budget} onChange={edit(setBudget)} note={moneyNote(budget, t("budget_note"))} invalid={!usdOk(budgetUsd)} />
          <MoneyField label={t("cap_label")} value={cap} onChange={edit(setCap)} invalid={capOver || !usdOk(capUsd)} note={capNote} />
        </div>
        <SeatList seats={seats} setSeats={(f) => { flow.clear(); setSeats(f); }} agentOf={agentOf} installed={installed} />
        {flow.publicAsk && (
          <PublicRepoConfirm action="start" busy={flow.pending} onCancel={flow.clear}
            onConfirm={() => flow.publicAsk && flow.send({ ...flow.publicAsk, allowPublic: true })} />
        )}
      </div>
      <ModalFooter className="mt-[10px]">
        <div className="flex shrink-0 flex-col gap-0.5">
          <span className="text-[12px] font-bold text-txt">{t("summary", { seats: seats.length, devices: deviceTypes(seats) })}</span>
          <span className="font-[family-name:var(--font-mono)] text-[10px] text-txt-4">{t("opens_pr")}</span>
        </div>
        <span aria-live="polite" className={cn("min-w-0 flex-1 text-right text-[11px]", flow.error ? "text-red" : "text-txt-4")}>
          {flow.error ?? (missing.length > 0 ? t("needs", { list: format.list(missing.map((m) => t(`missing.${m}`)), { type: "conjunction" }) }) : "")}
        </span>
        <PrimaryAction ready={ready} onClick={submit}>{flow.pending ? t("starting") : t("start")}</PrimaryAction>
      </ModalFooter>
    </>
  );
}
