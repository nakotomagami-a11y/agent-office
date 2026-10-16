"use client";

import { useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { MISSION_LIMITS } from "@agent-office/domain/config/missions";
import type { OpenAsk } from "@agent-office/domain/types";
import { cn } from "@/lib/cn";
import { FOCUS_RING } from "./mission-fields";

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <p className="mb-1 text-[11.5px] text-txt-3">{title}</p>
      <ul className="flex flex-col gap-1.5">{children}</ul>
    </div>
  );
}

export function Action({ label, onClick, busy, ariaLabel, danger }: { label: string; onClick: () => void; busy: boolean; ariaLabel?: string; danger?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      aria-label={ariaLabel}
      className={cn(
        "h-7 shrink-0 rounded-lg border bg-card-3 px-2.5 text-[12px] transition-[border-color,color] duration-[120ms] disabled:opacity-50", FOCUS_RING,
        // Red marks the confirm step as a border only: red text on card-3 is under 4.5:1 in the light theme.
        danger ? "border-red font-semibold text-txt hover:bg-red-soft" : "border-edge-2 text-txt-2 hover:border-line-strong hover:text-txt",
      )}
    >
      {label}
    </button>
  );
}

/** Two clicks for what cannot be taken back: the first says what will happen, the second does it. */
export function ConfirmAction({ label, confirmLabel, warning, busy, onConfirm, ariaLabel }: {
  label: string; confirmLabel: string; warning: string; busy: boolean; onConfirm: () => void; ariaLabel?: string;
}) {
  const t = useTranslations("missions.panel");
  const [sure, setSure] = useState(false);
  return (
    <>
      {sure && <span role="status" className="basis-full text-right text-txt-3 [text-wrap:pretty]">{warning}</span>}
      <span className="ml-auto flex gap-1.5">
        {sure && <Action label={t("cancel")} busy={false} onClick={() => setSure(false)} />}
        <Action label={sure ? confirmLabel : label} ariaLabel={sure ? undefined : ariaLabel} danger={sure} busy={busy}
          onClick={() => { if (sure) { setSure(false); onConfirm(); } else setSure(true); }} />
      </span>
    </>
  );
}

/** The answer stays in the box until the server took it: a failed post must not eat what was typed.
 *  `drafts` outlives this item, so closing the panel mid-sentence loses nothing either. */
export function AskItem({ ask, busy, drafts, onAnswer }: {
  ask: OpenAsk; busy: boolean; drafts: Map<number, string>; onAnswer: (text: string, posted: () => void) => void;
}) {
  const t = useTranslations("missions.panel");
  const [text, setTextState] = useState(() => drafts.get(ask.commentId) ?? "");
  const setText = (v: string) => {
    setTextState(v);
    if (v) drafts.set(ask.commentId, v);
    else drafts.delete(ask.commentId);
  };
  const send = () => {
    const sent = text;
    onAnswer(sent.trim(), () => { if ((drafts.get(ask.commentId) ?? "") === sent) setText(""); });
  };
  const ruling = ask.kind === "decision-request";
  return (
    <li className="flex flex-col gap-1.5 rounded-lg border border-edge-2 bg-card-3 p-2">
      <p className="text-txt-3"><code>{ask.seat}</code> · {t(`ask_kind.${ask.kind}`)}</p>
      <p className="max-h-[120px] overflow-y-auto whitespace-pre-wrap text-txt" tabIndex={0}>{ask.text}</p>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        readOnly={busy}
        aria-busy={busy || undefined}
        rows={2}
        maxLength={MISSION_LIMITS.answerChars}
        aria-label={t("answer_aria", { seat: ask.seat })}
        placeholder={ruling ? t("decision_placeholder") : t("answer_placeholder")}
        className="w-full resize-y rounded-md border border-edge-2 bg-card-2 p-1.5 text-txt outline-none placeholder:text-txt-4 focus:border-acc-line"
      />
      <span className="self-end">
        <Action label={ruling ? t("decide") : t("answer")} busy={busy || !text.trim()} onClick={send} />
      </span>
    </li>
  );
}
