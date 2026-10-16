"use client";

import { useId, useState } from "react";
import type { HubSeatView, HubView } from "@agent-office/domain/types";
import { cn } from "@/lib/cn";
import { useClaimSeat, useJoinableHubs } from "../hooks/use-missions";
import { arrowKeys, deviceName, errorHint, FOCUS_RING, MAX_USD, MicroLabel, ModalFooter, MoneyField, PrimaryAction, usdOk } from "./mission-fields";

const JOIN_STEPS = [
  { n: "01", title: "Paste the PR", body: "The mission's draft PR on GitHub. It holds the goal, seats and messages." },
  { n: "02", title: "Pick a seat", body: "Only open seats that match this device's OS can be claimed." },
  { n: "03", title: "Wait for accept", body: "The mission owner accepts the claim before work starts here." },
];

const canClaim = (s: HubSeatView) => !s.taken && !s.mine && s.fits;

/** `#12`, `12`, or a PR URL from any of its tabs (`/files`, `#issuecomment-…`). A URL also names its repo. */
const PR_REF = /^(?:#?(\d+)|(?:https?:\/\/)?(?:www\.)?github\.com\/([^/\s]+\/[^/\s]+)\/pull\/(\d+)(?:[/?#].*)?)$/i;
export function parsePrRef(text: string): { pr: number; repo: string | null } | null {
  const m = PR_REF.exec(text.trim());
  if (!m) return null;
  return { pr: Number(m[1] ?? m[3]), repo: m[2]?.toLowerCase() ?? null };
}
const hubMatches = (h: HubView, ref: { pr: number; repo: string | null }) =>
  h.pr === ref.pr && !h.closed && (!ref.repo || h.url.toLowerCase().includes(`/${ref.repo}/pull/`));

function seatStatus(s: HubSeatView, pending: boolean): { text: string; tone: string } {
  if (pending) return { text: "claim pending", tone: "text-amber" };
  // `mine` is set at claim time, before the lead accepts: it does not mean the seat is held.
  if (s.mine) return { text: "claimed from this device", tone: "text-txt-3" };
  if (s.taken) return { text: "claimed", tone: "text-txt-4" };
  if (!s.fits) return { text: `open · needs ${deviceName(s.os)}`, tone: "text-txt-4" };
  return { text: "open", tone: "text-green" };
}

function JoinSteps() {
  return (
    <div className="flex flex-col gap-[18px] rounded-[16px] border border-dashed border-edge-2 px-[26px] pt-[26px] pb-6">
      <div className="flex flex-col gap-[5px]">
        <span className="text-[14px] font-extrabold tracking-[-0.01em] text-txt">Join from the mission&apos;s draft PR</span>
        <span className="max-w-[520px] text-[12px] leading-[1.6] text-txt-3 [text-wrap:pretty]">
          Whoever started the mission shares its PR link. Paste it above to see the seats and claim one that fits this device.
        </span>
      </div>
      <div className="flex gap-[10px]">
        {JOIN_STEPS.map((t) => (
          <div key={t.n} className="flex min-w-0 flex-1 basis-0 flex-col gap-1.5 rounded-[12px] border border-edge bg-card-2 px-[13px] py-3">
            <span className="font-[family-name:var(--font-mono)] text-[10px] text-acc">{t.n}</span>
            <span className="text-[12px] font-bold text-txt">{t.title}</span>
            <span className="text-[11px] leading-[1.5] text-txt-4 [text-wrap:pretty]">{t.body}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function HubCard({ hub, pick, onPick, claimed }: { hub: HubView; pick: string | null; onPick: (seat: string) => void; claimed: string | null }) {
  const open = claimed ? [] : hub.seats.filter(canClaim).map((s) => s.seat);
  return (
    <div className="flex flex-col gap-3 rounded-[16px] border border-edge bg-card-2 px-4 pt-4 pb-3 shadow-[var(--inset-hi)]">
      <div className="flex min-w-0 flex-col gap-1">
        <span className="text-[15px] font-extrabold tracking-[-0.01em] text-txt">{hub.title}</span>
        {hub.goal && <span className="line-clamp-4 whitespace-pre-wrap text-[12px] leading-[1.55] text-txt-3 [text-wrap:pretty]" title={hub.goal}>{hub.goal}</span>}
      </div>
      <div role="radiogroup" aria-label="Seats" className="flex flex-col gap-1" onKeyDown={arrowKeys(open, pick, onPick)}>
        {hub.seats.map((s) => {
          const ok = open.includes(s.seat);
          const on = pick === s.seat;
          const status = seatStatus(s, claimed === s.seat);
          return (
            <button key={s.seat} type="button" role="radio" data-value={s.seat} aria-checked={on} disabled={!ok} tabIndex={on ? 0 : -1} onClick={() => onPick(s.seat)}
              className={cn("flex items-center gap-3 rounded-[11px] border px-3 py-[10px] text-left transition-all duration-[140ms]", FOCUS_RING,
                on ? "border-acc-line bg-acc-soft" : "border-transparent", canClaim(s) || claimed === s.seat ? "opacity-100" : "opacity-55", ok ? "cursor-pointer" : "cursor-default")}>
              <span className={cn("flex h-[14px] w-[14px] shrink-0 items-center justify-center rounded-full border-[1.5px]", on ? "border-acc" : "border-edge-2")}>
                {on && <span className="h-1.5 w-1.5 rounded-full bg-acc" />}
              </span>
              <span className="w-[110px] truncate font-[family-name:var(--font-mono)] text-[12.5px] text-txt">{s.seat}</span>
              <span className="w-[90px] truncate text-[11px] text-txt-4">{s.agent}</span>
              <span className="w-[80px] text-[11px] text-txt-3">{deviceName(s.os)}</span>
              <span className={cn("flex-1 text-right text-[11px]", status.tone)}>{status.text}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function joinNote(o: { error: string | null; looked: boolean; hub: HubView | undefined; fetching: boolean; claimed: string | null; seat: HubSeatView | undefined; capOk: boolean }): string {
  if (o.error) return o.error;
  if (!o.looked) return "Paste the mission's draft PR to see its seats.";
  if (!o.hub) return o.fetching ? "Looking for open missions…" : "No open mission at that PR in this project.";
  if (o.claimed) return "Claim posted to the PR. The mission owner accepts it from their Missions window.";
  if (!o.seat) return "No open seat fits this device.";
  if (!o.capOk) return `Set this device's cap between $0 and $${MAX_USD}.`;
  return "The owner accepts your claim before this device starts work.";
}

/** Join a hub by its PR. Claiming is the human's click on THIS device; the lead still has to
 *  accept it before the seat's agent hears anything. Hubs come from this project's repo only. */
export function MissionJoinList({ projectId }: { projectId: string }) {
  const { data: hubs, isFetching, error: listError, refetch } = useJoinableHubs(projectId, true);
  const claim = useClaimSeat();
  const labelId = useId();
  const [prUrl, setPrUrl] = useState("");
  const [ref, setRef] = useState<ReturnType<typeof parsePrRef> | undefined>(undefined);
  const [chosen, setChosen] = useState<string | null>(null);
  const [cap, setCap] = useState("5");
  const [claimed, setClaimed] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const hub = ref ? hubs?.find((h) => hubMatches(h, ref)) : undefined;
  const pick = chosen ?? (claimed ? null : hub?.seats.find(canClaim)?.seat ?? null);
  const seat = hub?.seats.find((s) => s.seat === pick && canClaim(s));
  const capUsd = parseFloat(cap) || 0;
  const reset = () => { setChosen(null); setClaimed(null); setError(null); };
  const lookup = () => { setRef(parsePrRef(prUrl)); reset(); void refetch(); };
  const submit = () => {
    if (!hub || !seat) return;
    setError(null);
    claim.mutate({ projectId, pr: hub.pr, seat: seat.seat, capUsd, manifestHash: hub.manifestHash }, {
      onSuccess: () => { setChosen(seat.seat); setClaimed(seat.seat); },
      onError: (e) => setError(errorHint(e)),
    });
  };
  const listFailed = listError ? `Could not list missions: ${errorHint(listError)}` : null;
  const note = joinNote({ error: error ?? listFailed, looked: ref !== undefined, hub, fetching: isFetching, claimed, seat, capOk: usdOk(capUsd) });

  return (
    <>
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-[22px] pt-[18px] pb-5">
        <div className="flex flex-col gap-1.5">
          <MicroLabel id={labelId}>Mission PR</MicroLabel>
          <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (prUrl.trim()) lookup(); }}>
            <input aria-labelledby={labelId} value={prUrl} onChange={(e) => { setPrUrl(e.target.value); setRef(undefined); reset(); }}
              placeholder="github.com/owner/repo/pull/123"
              className="h-10 min-w-0 flex-1 rounded-[12px] border border-edge bg-card-2 px-[13px] font-[family-name:var(--font-mono)] text-[12.5px] text-txt outline-none placeholder:text-txt-4/75 focus:border-acc-line" />
            <button type="submit" disabled={!prUrl.trim()}
              className={cn("flex h-10 items-center rounded-[12px] border border-edge-2 bg-card-3 px-4 text-[12.5px] font-bold text-txt enabled:hover:border-acc-line disabled:cursor-default disabled:text-txt-4", FOCUS_RING)}>
              {isFetching && ref !== undefined ? "Looking…" : "Look up"}
            </button>
          </form>
        </div>
        {hub ? <HubCard hub={hub} pick={pick} onPick={(s) => { setChosen(s); setError(null); }} claimed={claimed} /> : <JoinSteps />}
        {seat && !claimed && (
          <div className="flex gap-3">
            <div className="flex min-w-0 flex-[2] basis-0 flex-col gap-1.5">
              <MicroLabel>Seat brief</MicroLabel>
              <span className="rounded-[12px] border border-edge bg-card-2 px-[13px] py-[11px] text-[12.5px] leading-[1.55] text-txt-2">{seat.brief || "No brief."}</span>
            </div>
            <MoneyField label="This device's cap" value={cap} onChange={(v) => { setCap(v); setError(null); }} invalid={!usdOk(capUsd)} />
          </div>
        )}
      </div>
      <ModalFooter>
        <span aria-live="polite" className={cn("text-[11.5px] leading-[1.5]", error || listFailed ? "text-red" : claimed ? "text-amber" : "text-txt-4")}>{note}</span>
        <span className="flex-1" />
        <PrimaryAction ready={!!seat && !claimed && usdOk(capUsd) && !claim.isPending} onClick={submit} className={claimed ? "text-txt-2" : undefined}>
          {claimed ? "Claim pending" : claim.isPending ? "Claiming…" : seat ? `Claim ${seat.seat}` : "Claim seat"}
        </PrimaryAction>
      </ModalFooter>
    </>
  );
}
