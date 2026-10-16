"use client";

import { useState } from "react";
import type { MissionView, OpenAsk } from "@agent-office/domain/types";
import { ApiError } from "@/lib/api/fetch";
import { useMissionActions } from "../hooks/use-missions";

/** A refused action says why: the API's `hint` is the remediation for its code. */
function reason(e: unknown): string {
  if (e instanceof ApiError && typeof e.data?.hint === "string") return e.data.hint;
  return e instanceof Error ? e.message : "That did not go through.";
}

const ALARM: Record<NonNullable<MissionView["alarm"]>, string> = {
  lead_changed: "Routing stopped: the hub's history changed (the lead's seating was edited or deleted). Check the PR before anything moves.",
  forged: "Routing stopped: a comment on the hub claims to come from this device, but this device never posted it. Check the PR.",
};

export function MissionPanel({ mission }: { mission: MissionView }) {
  const a = useMissionActions(mission.missionId);
  const [error, setError] = useState<string | null>(null);
  const on = { onError: (e: unknown) => setError(reason(e)), onSuccess: () => setError(null) };

  return (
    <div className="flex flex-col gap-3 text-[12px]">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-[13px] text-ao-fg-0">{mission.title}</p>
        <a href={mission.url} target="_blank" rel="noreferrer" className="shrink-0 text-ao-fg-2 underline hover:text-ao-fg-0">PR #{mission.pr}</a>
      </div>
      {mission.closed && <p className="text-ao-fg-2">This mission is closed.</p>}
      {mission.alarm && (
        <p className="rounded-lg border border-ao-red p-2 text-ao-red">
          {ALARM[mission.alarm]}
          {mission.forged.length > 0 && <> Comments: {mission.forged.map((id) => <a key={id} href={`${mission.url}#issuecomment-${id}`} target="_blank" rel="noreferrer" className="underline"> #{id}</a>)}</>}
        </p>
      )}

      <Section title="Seats">
        {mission.seats.map((s) => (
          <li key={s.seat} className="flex items-center gap-2">
            <code className="text-ao-fg-0">{s.seat}</code>
            <span className="text-ao-fg-2">{s.agent}</span>
            <span className="ml-auto truncate text-ao-fg-2">{s.device ? `${s.device}${s.mine ? " (here)" : ""}` : "open"}</span>
            {s.paused && <span className="rounded bg-ao-bg-4 px-1.5 text-ao-fg-1">paused</span>}
            {mission.leadHere && s.device && s.seat !== "coordinator" && (
              <Action label={s.paused ? "Resume" : "Pause"} busy={a.act.isPending}
                onClick={() => a.act.mutate({ act: s.paused ? "resume" : "pause", seats: [s.seat] }, on)} />
            )}
          </li>
        ))}
      </Section>

      {mission.claims.length > 0 && (
        <Section title="Waiting for you: claims">
          {mission.claims.map((c) => (
            <li key={c.commentId} className="flex items-center gap-2">
              <span className="text-ao-fg-0">{c.device} wants <code>{c.seat}</code></span>
              <span className="ml-auto flex gap-1.5">
                <Action label="Accept" busy={a.decideClaim.isPending} onClick={() => a.decideClaim.mutate({ claimId: c.commentId, accept: true }, on)} />
                <Action label="Reject" busy={a.decideClaim.isPending} onClick={() => a.decideClaim.mutate({ claimId: c.commentId, accept: false }, on)} />
              </span>
            </li>
          ))}
        </Section>
      )}

      {mission.asks.length > 0 && (
        <Section title="Waiting for you: questions">
          {mission.asks.map((q) => <AskItem key={q.commentId} ask={q} busy={a.answer.isPending}
            onAnswer={(text) => a.answer.mutate({ askId: q.commentId, text }, on)} />)}
        </Section>
      )}

      <Section title="On this device">
        {mission.local.map((l) => (
          <li key={l.seat} className="flex items-center gap-2">
            <code className="text-ao-fg-0">{l.seat}</code>
            <span className="text-ao-fg-2">{l.accepted ? `$${l.spentUsd.toFixed(2)} of $${l.capUsd.toFixed(2)}` : "waiting for the lead to accept"}</span>
            <span className="ml-auto flex gap-1.5">
              {l.accepted && <Action label="Allow +$5" busy={a.raiseCap.isPending} onClick={() => a.raiseCap.mutate({ seat: l.seat, byUsd: 5 }, on)} />}
              {l.seat !== "coordinator" && <Action label="Leave" busy={a.leave.isPending} onClick={() => a.leave.mutate(l.seat, on)} />}
            </span>
          </li>
        ))}
      </Section>

      {mission.leadHere && !mission.closed && (
        <CloseMission busy={a.act.isPending} onClose={() => a.act.mutate({ act: "close", seats: [] }, on)} />
      )}
      {error && <p role="alert" className="text-ao-red">{error}</p>}
    </div>
  );
}

function AskItem({ ask, busy, onAnswer }: { ask: OpenAsk; busy: boolean; onAnswer: (text: string) => void }) {
  const [text, setText] = useState("");
  const ruling = ask.kind === "decision-request";
  return (
    <li className="flex flex-col gap-1.5 rounded-lg border border-ao-line-1 bg-ao-bg-3 p-2">
      <p className="text-ao-fg-2"><code>{ask.seat}</code> · {ruling ? "needs your decision" : ask.kind === "human-task" ? "needs you to do something" : "asks"}</p>
      <p className="whitespace-pre-wrap text-ao-fg-0 max-h-[120px] overflow-y-auto" tabIndex={0}>{ask.text}</p>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={2}
        aria-label={`Answer to ${ask.seat}`}
        placeholder={ruling ? "Your decision…" : "Your answer, or the output you pasted…"}
        className="w-full resize-y rounded-md border border-ao-line-1 bg-ao-bg-2 p-1.5 text-ao-fg-0"
      />
      <span className="self-end">
        <Action label={ruling ? "Decide" : "Answer"} busy={busy || !text.trim()} onClick={() => { onAnswer(text.trim()); setText(""); }} />
      </span>
    </li>
  );
}

function CloseMission({ busy, onClose }: { busy: boolean; onClose: () => void }) {
  const [sure, setSure] = useState(false);
  return (
    <div className="flex items-center gap-2">
      {sure && <span className="text-ao-fg-2">Every seat stops, on every device.</span>}
      <span className="ml-auto flex gap-1.5">
        {sure && <Action label="Cancel" busy={false} onClick={() => setSure(false)} />}
        <Action label={sure ? "Close it" : "Close mission"} busy={busy} onClick={() => (sure ? onClose() : setSure(true))} />
      </span>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-1 text-[11.5px] text-ao-fg-2">{title}</p>
      <ul className="flex flex-col gap-1.5">{children}</ul>
    </div>
  );
}

function Action({ label, onClick, busy }: { label: string; onClick: () => void; busy: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      className="h-7 px-2.5 rounded-lg border border-ao-line-1 bg-ao-bg-3 text-[12px] text-ao-fg-1 transition-[background,color] duration-[120ms] hover:bg-ao-bg-4 hover:text-ao-fg-0 disabled:opacity-50"
    >
      {label}
    </button>
  );
}
