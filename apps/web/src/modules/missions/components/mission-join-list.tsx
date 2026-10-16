"use client";

import { useId, useState } from "react";
import { useTranslations } from "next-intl";
import type { HubSeatView, HubView } from "@agent-office/domain/types";
import { cn } from "@/lib/cn";
import { missionFailure } from "../format/mission-errors";
import { parseUsd, usdOk } from "../format/money";
import { hubMatches, parsePrRef, type PrRef } from "../format/pr-ref";
import { canClaim, hubSeatStatus } from "../format/seat-status";
import { useMissionErrorText } from "../hooks/use-mission-error";
import { useClaimSeat, useJoinableHubs, type ClaimSeatInput } from "../hooks/use-missions";
import { arrowKeys, FOCUS_RING, MicroLabel, ModalFooter, MoneyField, PrimaryAction, PublicRepoConfirm, TONE, useMoneyNote } from "./mission-fields";

const JOIN_STEPS = ["paste", "pick", "wait"] as const;

function JoinSteps() {
  const t = useTranslations("missions.join");
  return (
    <div className="flex flex-col gap-[18px] rounded-[16px] border border-dashed border-edge-2 px-[26px] pt-[26px] pb-6">
      <div className="flex flex-col gap-[5px]">
        <span className="text-[14px] font-extrabold tracking-[-0.01em] text-txt">{t("steps_title")}</span>
        <span className="max-w-[520px] text-[12px] leading-[1.6] text-txt-3 [text-wrap:pretty]">{t("steps_body")}</span>
      </div>
      <div className="flex gap-[10px]">
        {JOIN_STEPS.map((step, i) => (
          <div key={step} className="flex min-w-0 flex-1 basis-0 flex-col gap-1.5 rounded-[12px] border border-edge bg-card-2 px-[13px] py-3">
            <span className="font-[family-name:var(--font-mono)] text-[10px] text-acc">{String(i + 1).padStart(2, "0")}</span>
            <span className="text-[12px] font-bold text-txt">{t(`step_${step}_title`)}</span>
            <span className="text-[11px] leading-[1.5] text-txt-4 [text-wrap:pretty]">{t(`step_${step}_body`)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function SeatRow({ seat: s, on, ok, pending, onPick }: { seat: HubSeatView; on: boolean; ok: boolean; pending: boolean; onPick: () => void }) {
  const t = useTranslations("missions");
  const status = hubSeatStatus(s, pending);
  return (
    <button type="button" role="radio" data-value={s.seat} aria-checked={on} disabled={!ok} tabIndex={on ? 0 : -1} onClick={onPick}
      className={cn("flex items-center gap-3 rounded-[11px] border px-3 py-[10px] text-left transition-all duration-[140ms]", FOCUS_RING,
        on ? "border-acc-line bg-acc-soft" : "border-transparent", canClaim(s) || pending ? "opacity-100" : "opacity-55", ok ? "cursor-pointer" : "cursor-default")}>
      <span className={cn("flex h-[14px] w-[14px] shrink-0 items-center justify-center rounded-full border-[1.5px]", on ? "border-acc" : "border-edge-2")}>
        {on && <span className="h-1.5 w-1.5 rounded-full bg-acc" />}
      </span>
      <span className="w-[110px] truncate font-[family-name:var(--font-mono)] text-[12.5px] text-txt">{s.seat}</span>
      <span className="w-[90px] truncate text-[11px] text-txt-4">{s.agent}</span>
      <span className="w-[80px] text-[11px] text-txt-3">{t(`device.${s.os}`)}</span>
      <span className={cn("flex-1 text-right text-[11px]", TONE[status.tone])}>{t(`join.status.${status.key}`, { device: t(`device.${s.os}`) })}</span>
    </button>
  );
}

function HubCard({ hub, pick, onPick, claimed }: { hub: HubView; pick: string | null; onPick: (seat: string) => void; claimed: string | null }) {
  const t = useTranslations("missions.join");
  const open = claimed ? [] : hub.seats.filter(canClaim).map((s) => s.seat);
  return (
    <div className="flex flex-col gap-3 rounded-[16px] border border-edge bg-card-2 px-4 pt-4 pb-3 shadow-[var(--inset-hi)]">
      <div className="flex min-w-0 flex-col gap-1">
        <span className="text-[15px] font-extrabold tracking-[-0.01em] text-txt">{hub.title}</span>
        {hub.goal && <span className="line-clamp-4 whitespace-pre-wrap text-[12px] leading-[1.55] text-txt-3 [text-wrap:pretty]" title={hub.goal}>{hub.goal}</span>}
      </div>
      <div role="radiogroup" aria-label={t("seats")} className="flex flex-col gap-1" onKeyDown={arrowKeys(open, pick, onPick)}>
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
  const labelId = useId();
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
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-[22px] pt-[18px] pb-5">
        <div className="flex flex-col gap-1.5">
          <MicroLabel id={labelId}>{t("pr_label")}</MicroLabel>
          <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (prUrl.trim()) lookup(); }}>
            <input aria-labelledby={labelId} value={prUrl} onChange={(e) => { setPrUrl(e.target.value); setRef(undefined); reset(); }}
              placeholder={t("pr_placeholder")} aria-invalid={ref === null || undefined}
              className={cn("h-10 min-w-0 flex-1 rounded-[12px] border bg-card-2 px-[13px] font-[family-name:var(--font-mono)] text-[12.5px] text-txt outline-none placeholder:text-txt-4/75 focus:border-acc-line",
                ref === null ? "border-red" : "border-edge")} />
            <button type="submit" disabled={!prUrl.trim()}
              className={cn("flex h-10 items-center rounded-[12px] border border-edge-2 bg-card-3 px-4 text-[12.5px] font-bold text-txt enabled:hover:border-acc-line disabled:cursor-default disabled:text-txt-4", FOCUS_RING)}>
              {isFetching && ref ? t("looking") : t("look_up")}
            </button>
          </form>
        </div>
        {hub ? <HubCard hub={hub} pick={pick} onPick={(s) => { setChosen(s); flow.clear(); }} claimed={claimed} /> : <JoinSteps />}
        {seat && !claimed && (
          <div className="flex gap-3">
            <div className="flex min-w-0 flex-[2] basis-0 flex-col gap-1.5">
              <MicroLabel>{t("brief_label")}</MicroLabel>
              <span className="rounded-[12px] border border-edge bg-card-2 px-[13px] py-[11px] text-[12.5px] leading-[1.55] text-txt-2">{seat.brief || t("no_brief")}</span>
            </div>
            <MoneyField label={t("cap_label")} value={cap} onChange={(v) => { setCap(v); flow.clear(); }} invalid={!usdOk(capUsd)} note={moneyNote(cap)} />
          </div>
        )}
        {flow.publicAsk && (
          <PublicRepoConfirm action="claim" busy={flow.pending} onCancel={flow.clear}
            onConfirm={() => flow.publicAsk && flow.send({ ...flow.publicAsk, allowPublic: true })} />
        )}
      </div>
      <ModalFooter>
        <span aria-live="polite" className={cn("text-[11.5px] leading-[1.5]", flow.error || listFailed || noteKey === "not_a_pr" ? "text-red" : claimed ? "text-amber" : "text-txt-4")}>{note}</span>
        <span className="flex-1" />
        <PrimaryAction ready={!!seat && !claimed && usdOk(capUsd) && !flow.pending && !flow.publicAsk} onClick={submit} className={claimed ? "text-txt-2" : undefined}>
          {claimed ? t("claim_pending") : flow.pending ? t("claiming") : seat ? t("claim_seat_named", { seat: seat.seat }) : t("claim_seat")}
        </PrimaryAction>
      </ModalFooter>
    </>
  );
}
