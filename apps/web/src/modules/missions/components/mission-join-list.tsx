"use client";

import { useId, useState } from "react";
import { useTranslations } from "next-intl";
import type { HubSeatView, HubView } from "@agent-office/domain/types";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/cn";
import { missionFailure } from "../format/mission-errors";
import { parseUsd, usdOk } from "../format/money";
import { hubMatches, parsePrRef, type PrRef } from "../format/pr-ref";
import { canClaim, hubSeatStatus } from "../format/seat-status";
import { useMissionErrorText } from "../hooks/use-mission-error";
import { useClaimSeat, useJoinableHubs, type ClaimSeatInput } from "../hooks/use-missions";
import { arrowKeys, CTA_FILL, FieldLabel, FOCUS_RING, ModalFooter, MoneyField, PrimaryAction, PublicRepoConfirm, TONE, useMoneyNote } from "./mission-fields";

const JOIN_STEPS = ["paste", "pick", "wait"] as const;

function JoinSteps() {
  const t = useTranslations("missions.join");
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <span className="text-[15px] font-extrabold text-txt">{t("steps_title")}</span>
        <span className="max-w-[560px] text-[12.5px] leading-[1.55] text-txt-3 [text-wrap:pretty]">{t("steps_body")}</span>
      </div>
      <ol role="list" className="m-0 flex list-none gap-[10px] p-0">
        {JOIN_STEPS.map((step, i) => (
          <li key={step} className="flex min-w-0 flex-1 basis-0 flex-col gap-2 rounded-[14px] bg-card-2 p-[14px]">
            <span aria-hidden className="flex h-[26px] w-[26px] items-center justify-center rounded-full bg-acc-soft font-[family-name:var(--font-mono)] text-[11px] font-bold text-acc-2 dark:text-acc">
              {String(i + 1).padStart(2, "0")}
            </span>
            <span className="text-[13px] font-bold text-txt">{t(`step_${step}_title`)}</span>
            <span className="text-[11.5px] leading-[1.5] text-txt-4 [text-wrap:pretty]">{t(`step_${step}_body`)}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

function SeatRow({ seat: s, on, ok, pending, onPick }: { seat: HubSeatView; on: boolean; ok: boolean; pending: boolean; onPick: () => void }) {
  const t = useTranslations("missions");
  const status = hubSeatStatus(s, pending);
  return (
    <button type="button" role="radio" data-value={s.seat} aria-checked={on} disabled={!ok} tabIndex={on ? 0 : -1} onClick={onPick}
      className={cn("flex h-[50px] items-center gap-3 rounded-[12px] px-3 text-left transition-all duration-[140ms]", FOCUS_RING,
        on ? "bg-acc-soft shadow-[inset_0_0_0_1px_var(--acc-line)]" : "bg-transparent", canClaim(s) || pending ? "opacity-100" : "opacity-55", ok ? "cursor-pointer" : "cursor-default", ok && !on && "hover:bg-card-2")}>
      <span aria-hidden className={cn("h-4 w-4 shrink-0 rounded-full transition-shadow duration-[140ms]",
        on ? "shadow-[inset_0_0_0_5px_var(--acc)]" : "shadow-[inset_0_0_0_1.5px_var(--edge-2)]")} />
      <span className="w-[120px] truncate font-[family-name:var(--font-mono)] text-[13px] font-semibold text-txt">{s.seat}</span>
      <span className="w-[90px] truncate text-[12px] text-txt-4">{s.agent}</span>
      <span className="w-[80px] text-[12px] text-txt-3">{t(`device.${s.os}`)}</span>
      <span className={cn("flex-1 text-right text-[12px] font-semibold", TONE[status.tone])}>{t(`join.status.${status.key}`, { device: t(`device.${s.os}`) })}</span>
    </button>
  );
}

function HubCard({ hub, pick, onPick, claimed }: { hub: HubView; pick: string | null; onPick: (seat: string) => void; claimed: string | null }) {
  const t = useTranslations("missions.join");
  const open = claimed ? [] : hub.seats.filter(canClaim).map((s) => s.seat);
  return (
    <div className="flex flex-col gap-[14px] motion-safe:animate-[lrIn_260ms_ease_both]">
      <div className="flex min-w-0 flex-col gap-1">
        <span className="text-[17px] font-extrabold tracking-[-0.02em] text-txt">{hub.title}</span>
        {hub.goal && <span className="line-clamp-4 whitespace-pre-wrap text-[12.5px] leading-[1.55] text-txt-3 [text-wrap:pretty]" title={hub.goal}>{hub.goal}</span>}
      </div>
      <div role="radiogroup" aria-label={t("seats")} className="flex flex-col" onKeyDown={arrowKeys(open, pick, onPick)}>
        {hub.seats.map((s) => (
          <SeatRow key={s.seat} seat={s} on={pick === s.seat} ok={open.includes(s.seat)} pending={claimed === s.seat} onPick={() => onPick(s.seat)} />
        ))}
      </div>
    </div>
  );
}

type NoteKey = "paste" | "not_a_pr" | "looking" | "no_hub" | "claimed" | "no_seat" | "bad_cap" | "ready";

function joinNote(o: { looked: boolean; ref: PrRef | null | undefined; hub: HubView | undefined; fetching: boolean; claimed: string | null; seat: HubSeatView | undefined; capOk: boolean }): NoteKey {
  if (!o.looked) return "paste";
  if (o.ref === null) return "not_a_pr";
  if (!o.hub) return o.fetching ? "looking" : "no_hub";
  if (o.claimed) return "claimed";
  if (!o.seat) return "no_seat";
  return o.capOk ? "ready" : "bad_cap";
}

function useClaimFlow(onClaimed: (seat: string) => void) {
  const claim = useClaimSeat();
  const errorText = useMissionErrorText();
  const [error, setError] = useState<string | null>(null);
  const [publicAsk, setPublicAsk] = useState<ClaimSeatInput | null>(null);
  const send = (input: ClaimSeatInput) => {
    setError(null);
    setPublicAsk(null);
    claim.mutate(input, {
      onSuccess: () => onClaimed(input.seat),
      onError: (e) => (missionFailure(e).key === "repo_public" ? setPublicAsk(input) : setError(errorText(e))),
    });
  };
  const clear = () => { setError(null); setPublicAsk(null); };
  return { send, clear, error, publicAsk, pending: claim.isPending };
}

/** Join a hub by its PR. Claiming is the human's click on THIS device; the lead still has to
 *  accept it before the seat's agent hears anything. Hubs come from this project's repo only. */
export function MissionJoinList({ projectId, active }: { projectId: string; active: boolean }) {
  const t = useTranslations("missions.join");
  const errorText = useMissionErrorText();
  const moneyNote = useMoneyNote();
  const { data: hubs, isFetching, error: listError, refetch } = useJoinableHubs(projectId, active);
  const prId = useId();
  const [prUrl, setPrUrl] = useState("");
  const [ref, setRef] = useState<PrRef | null | undefined>(undefined);
  const [chosen, setChosen] = useState<string | null>(null);
  const [cap, setCap] = useState("5");
  const [claimed, setClaimed] = useState<string | null>(null);
  const flow = useClaimFlow((s) => { setChosen(s); setClaimed(s); });

  const hub = ref ? hubs?.find((h) => hubMatches(h, ref)) : undefined;
  const pick = chosen ?? (claimed ? null : hub?.seats.find(canClaim)?.seat ?? null);
  const seat = hub?.seats.find((s) => s.seat === pick && canClaim(s));
  const capUsd = parseUsd(cap);
  const reset = () => { setChosen(null); setClaimed(null); flow.clear(); };
  const lookup = () => { const r = parsePrRef(prUrl); setRef(r); reset(); if (r) void refetch(); };
  const submit = () => {
    if (hub && seat && usdOk(capUsd)) flow.send({ projectId, pr: hub.pr, seat: seat.seat, capUsd, manifestHash: hub.manifestHash });
  };
  const listFailed = listError ? t("list_failed", { reason: errorText(listError) }) : null;
  const noteKey = joinNote({ looked: ref !== undefined, ref, hub, fetching: isFetching, claimed, seat, capOk: usdOk(capUsd) });
  const note = flow.error ?? listFailed ?? t(`note.${noteKey}`);

  return (
    <>
      <div className="flex min-h-0 flex-1 flex-col gap-[18px] overflow-y-auto px-6 pt-[14px] pb-2 motion-safe:animate-[lrIn_260ms_ease_both]">
        <div className="flex flex-col gap-1.5">
        <FieldLabel htmlFor={prId}>{t("pr_label")}</FieldLabel>
        <form className="relative flex items-center" onSubmit={(e) => { e.preventDefault(); if (prUrl.trim()) lookup(); }}>
          <Icon name="branch" size={14} className="pointer-events-none absolute left-4 h-3.5 w-3.5 text-txt-4" />
          <input id={prId} value={prUrl} onChange={(e) => { setPrUrl(e.target.value); setRef(undefined); reset(); }}
            placeholder={t("pr_placeholder")} spellCheck={false} aria-invalid={ref === null || undefined}
            className={cn("h-[50px] w-full rounded-[14px] border-none bg-card-2 pr-28 pl-[42px] font-[family-name:var(--font-mono)] text-[13px] text-txt outline-none transition-shadow duration-[140ms] placeholder:text-txt-4/75",
              ref === null ? "shadow-[0_0_0_2px_var(--red)]" : "focus:shadow-[0_0_0_2px_var(--acc-line)]")} />
          <button type="submit" disabled={!prUrl.trim()}
            className={cn("absolute right-[7px] inline-flex h-9 min-w-[92px] items-center justify-center rounded-[10px] px-[14px] text-[12.5px] font-bold enabled:hover:brightness-90 disabled:cursor-default disabled:opacity-45", CTA_FILL, FOCUS_RING)}>
            {isFetching && ref ? t("looking") : t("look_up")}
          </button>
        </form>
        </div>
        {hub ? <HubCard hub={hub} pick={pick} onPick={(s) => { setChosen(s); flow.clear(); }} claimed={claimed} /> : <JoinSteps />}
        {seat && !claimed && (
          <div className="flex gap-3">
            <div className="flex min-w-0 flex-[2] basis-0 flex-col gap-1.5">
              <FieldLabel>{t("brief_label")}</FieldLabel>
              <span className="rounded-[12px] bg-card-2 px-[14px] py-3 text-[12.5px] leading-[1.55] text-txt-2">{seat.brief || t("no_brief")}</span>
            </div>
            <MoneyField label={t("cap_label")} value={cap} onChange={(v) => { setCap(v); flow.clear(); }} invalid={!usdOk(capUsd)} note={moneyNote(cap)} boxed />
          </div>
        )}
        {flow.publicAsk && (
          <PublicRepoConfirm action="claim" busy={flow.pending} onCancel={flow.clear}
            onConfirm={() => flow.publicAsk && flow.send({ ...flow.publicAsk, allowPublic: true })} />
        )}
      </div>
      <ModalFooter className="mt-2">
        <span aria-live="polite" className={cn("flex-1 text-[12px] leading-[1.5]", flow.error || listFailed || noteKey === "not_a_pr" ? "text-red" : claimed ? "text-amber" : "text-txt-4")}>{note}</span>
        <PrimaryAction ready={!!seat && !claimed && usdOk(capUsd) && !flow.pending && !flow.publicAsk} busy={flow.pending} waiting={!!claimed} onClick={submit}>
          {claimed ? t("claim_pending") : flow.pending ? t("claiming") : seat ? t("claim_seat_named", { seat: seat.seat }) : t("claim_seat")}
        </PrimaryAction>
      </ModalFooter>
    </>
  );
}
