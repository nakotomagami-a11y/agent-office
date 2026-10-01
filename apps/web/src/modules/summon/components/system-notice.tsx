/**
 * A message Agent Office wrote into the conversation itself — today only the
 * background-shell watcher reporting a finished job.
 *
 * These go through the same `sendMessage` the reply box uses, so before this
 * they rendered as the USER'S message: their avatar, their bubble, their
 * queue. The user could not tell what they had said from what the app had.
 *
 * Deliberately not a user bubble and not an agent bubble: left-aligned, full
 * width, monospace label, no avatar. It should be impossible to mistake for
 * either side of the conversation.
 */
"use client";

import { Icon } from "@/components/ui/icon";

export interface SystemNoticeProps {
  text: string;
  /** Shown while the notice is still queued — "will run next", not "ran". */
  pending?: boolean;
  /** Queue position label, e.g. "2/3". */
  positionLabel?: string;
  /** Cancel it. Absent once the turn has run, since there is nothing to cancel. */
  onDismiss?: () => void;
}

export function SystemNotice({ text, pending, positionLabel, onDismiss }: SystemNoticeProps) {
  return (
    <div
      className={[
        "relative w-full rounded-[10px] border border-ao-line-1 bg-ao-bg-2/60 px-[14px] py-[11px]",
        "flex items-start gap-[10px]",
        pending ? "border-dashed" : "",
      ].join(" ")}
      data-origin="system"
    >
      <Icon name="terminal-ao" className="mt-[3px] shrink-0 w-[14px] h-[14px] text-ao-fg-3" aria-hidden />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-[8px] mb-[4px]">
          <span className="font-mono text-[10px] tracking-[0.08em] uppercase text-ao-fg-3">
            Agent Office
          </span>
          {pending ? (
            <span className="font-mono text-[10px] tracking-[0.06em] uppercase text-ao-fg-3 border border-ao-line-1 rounded-full px-[7px] py-[1px]">
              queued{positionLabel ? ` ${positionLabel}` : ""}
            </span>
          ) : null}
        </div>
        <div className="text-[13px] leading-[1.55] text-ao-fg-1 whitespace-pre-wrap break-words [overflow-wrap:anywhere]">
          {text}
        </div>
      </div>
      {onDismiss ? (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss this notice"
          title="Dismiss — the agent will not be woken"
          className="shrink-0 w-[20px] h-[20px] rounded-[6px] border border-ao-line-1 text-ao-fg-3 flex items-center justify-center p-0 cursor-pointer bg-transparent hover:bg-ao-bg-3 hover:text-ao-fg-1 focus-visible:outline-2 focus-visible:outline-[var(--acc)] focus-visible:outline-offset-2"
        >
          <Icon name="circle-x" className="w-[12px] h-[12px]" aria-hidden />
        </button>
      ) : null}
    </div>
  );
}
