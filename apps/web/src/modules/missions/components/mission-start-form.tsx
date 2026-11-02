"use client";

import { useId, useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { COORDINATOR_SEAT, MISSION_LIMITS } from "@agent-office/domain/config/missions";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/cn";
import { useAgents } from "@/modules/agents/hooks/use-agents";
import { useActiveProvider } from "@/modules/providers/hooks/use-providers";
import { missionFailure } from "../format/mission-errors";
import { parseUsd, usdOk } from "../format/money";
import { defaultAgent, deviceTypes, missingBits } from "../format/start-form";
import { useMissionErrorText } from "../hooks/use-mission-error";
import { useStartMission, type StartMissionInput } from "../hooks/use-missions";
import { FieldLabel, ModalFooter, MoneyField, PrimaryAction, PublicRepoConfirm, useMoneyNote } from "./mission-fields";
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
  const tp = useTranslations("providers");
  const { id: providerId, capabilities } = useActiveProvider();
  const template = useCrossDevice();
  const { data: agentList } = useAgents();
  const installed = agentList?.map((a) => a.id);
  const [title, setTitle] = useState("");
  const [goal, setGoal] = useState("");
  const [budget, setBudget] = useState("20");
  const [cap, setCap] = useState("5");
  const [seats, setSeats] = useState<SeatDraft[]>(template);
  const flow = useStartFlow(onStarted);
  const goalId = useId();
  const goalHintId = useId();
  const budgetId = useId();
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

  const capPct = usdOk(budgetUsd) && usdOk(capUsd) ? Math.min(100, (capUsd / budgetUsd) * 100) : 0;

  return (
    <>
      <div className="flex min-h-0 flex-1 flex-col gap-[22px] overflow-y-auto px-6 pt-[14px] pb-2 motion-safe:animate-[lrIn_260ms_ease_both]">
        <div className="flex items-center gap-[10px] rounded-[12px] bg-acc-soft px-[14px] py-[10px] text-[12.5px] leading-[1.5] text-txt-2 [text-wrap:pretty]">
          <Icon name="zap" size={14} className="h-3.5 w-3.5 [flex:0_0_14px] text-acc" />
          <span>{t("intro")} <span className="font-bold text-acc-2 dark:text-acc">{t("intro_cheaper")}</span></span>
        </div>
        <div className="flex flex-col gap-[10px]">
          <input aria-label={t("title_label")} value={title} maxLength={MISSION_LIMITS.titleChars} onChange={(e) => edit(setTitle)(e.target.value)} placeholder={t("title_placeholder")}
            className="w-full rounded-[6px] border-none bg-transparent py-0.5 text-[24px] font-extrabold tracking-[-0.025em] text-txt outline-none placeholder:text-txt-4/75 focus-visible:shadow-[0_1px_0_var(--acc-line)]" />
          <FieldLabel htmlFor={goalId}>{t("goal_label")}</FieldLabel>
          <textarea id={goalId} aria-describedby={goalHintId} rows={3} value={goal} maxLength={MISSION_LIMITS.goalChars} onChange={(e) => edit(setGoal)(e.target.value)} placeholder={t("goal_placeholder")}
            className="w-full resize-y rounded-[14px] border-none bg-card-2 px-[14px] py-3 text-[13.5px] leading-[1.55] text-txt outline-none transition-shadow duration-[140ms] placeholder:text-txt-4/75 focus:shadow-[0_0_0_2px_var(--acc-line)]" />
          <span id={goalHintId} className="px-1 text-[11.5px] text-txt-4">{t("goal_hint")}</span>
        </div>
        <div role="group" aria-labelledby={budgetId} className="flex flex-col gap-3 rounded-[16px] bg-card-2 px-[18px] py-4">
          <span id={budgetId} className="text-[13px] font-bold text-txt">{t("budget_title")}</span>
          <div className="flex gap-4">
            <MoneyField label={t("budget_label")} value={budget} onChange={edit(setBudget)} note={moneyNote(budget, t("budget_note"))} invalid={!usdOk(budgetUsd)} swatch="bg-[var(--line-strong)]" />
            <MoneyField label={t("cap_label")} value={cap} onChange={edit(setCap)} invalid={capOver || !usdOk(capUsd)} note={capNote} swatch="bg-acc" accent />
          </div>
          <div aria-hidden className="flex h-1.5 gap-[3px]">
            <span className="rounded-[3px] bg-acc transition-[width] duration-[260ms] ease-[cubic-bezier(.2,.8,.2,1)]" style={{ width: `${capPct}%` }} />
            <span className="flex-1 rounded-[3px] bg-[var(--line-strong)]" />
          </div>
          {capabilities.costKnown ? null : (
            <p role="note" className="m-0 text-[11.5px] leading-[1.55] text-amber text-pretty">
              {tp("caps_need_price", { provider: tp(`option_${providerId}_name`) })}
            </p>
          )}
        </div>
        <SeatList seats={seats} setSeats={(f) => { flow.clear(); setSeats(f); }} agentOf={agentOf} agents={agentList} />
        {flow.publicAsk && (
          <PublicRepoConfirm action="start" busy={flow.pending} onCancel={flow.clear}
            onConfirm={() => flow.publicAsk && flow.send({ ...flow.publicAsk, allowPublic: true })} />
        )}
      </div>
      <ModalFooter className="mt-2">
        <div className="flex shrink-0 flex-col gap-0.5">
          <span className="text-[12.5px] font-bold text-txt">{t("summary", { seats: seats.length, devices: deviceTypes(seats) })}</span>
          <span className="font-[family-name:var(--font-mono)] text-[10.5px] text-txt-4">{t("opens_pr")}</span>
        </div>
        <span aria-live="polite" className={cn("min-w-0 flex-1 text-right text-[11.5px] [text-wrap:pretty]", flow.error ? "text-red" : "text-txt-4")}>
          {flow.error ?? (missing.length > 0 ? t("needs", { list: format.list(missing.map((m) => t(`missing.${m}`)), { type: "conjunction" }) }) : "")}
        </span>
        <PrimaryAction ready={ready} busy={flow.pending} onClick={submit}>{flow.pending ? t("starting") : t("start")}</PrimaryAction>
      </ModalFooter>
    </>
  );
}
