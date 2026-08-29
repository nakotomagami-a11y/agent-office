"use client";

import type { ReactNode } from "react";
import { Icon, type IconName } from "@/components/ui/icon";

/**
 * Shared inline system-message card for warnings, errors, and neutral
 * pauses in the conversation thread (rate limits, run errors, auth
 * problems, interruptions). One visual language for all of them: a soft
 * severity-tinted background (no border, no left rail), a bare icon, and
 * an action row where each link is colored by what it *does* — not by the
 * card's severity. A destructive action (Stop) is always red, a
 * fix-it-and-continue action (Retry, Sign in, Repair) is always accent,
 * and a deferred/alternate action (Schedule resume, Switch account) is
 * always neutral. Mixing severity color into every action was the
 * inconsistency this replaces — an "approaching rate limit" (amber) card
 * shouldn't turn its "Continue" link amber too.
 */

export type FlagTone = "warn" | "err" | "neutral";
export type FlagActionTone = "danger" | "primary" | "neutral";

const TONE_COLOR: Record<FlagTone, string> = {
  warn: "var(--ao-warn)",
  err: "var(--ao-bad)",
  neutral: "var(--ao-fg-2)",
};

const TONE_BG: Record<FlagTone, string> = {
  warn: "rgba(230,179,90,0.08)",
  err: "rgba(217,83,79,0.08)",
  neutral: "var(--ao-bg-2)",
};

const ACTION_COLOR: Record<FlagActionTone, string> = {
  danger: "var(--ao-bad)",
  primary: "var(--ao-accent)",
  neutral: "var(--ao-fg-2)",
};

export type FlagAction = {
  key: string;
  label: string;
  tone: FlagActionTone;
  onClick?: () => void;
  href?: string;
  disabled?: boolean;
};

export function FlagCard({
  tone,
  icon,
  title,
  pill,
  body,
  detail,
  note,
  actions,
  extraActions,
  children,
}: {
  tone: FlagTone;
  icon: IconName;
  title: string;
  /** Small colored aside next to the title, e.g. "$12.40 spent this week". Plain text, not a badge. */
  pill?: string;
  body: string;
  /** Clamped mono detail line (raw error text, cwd path, etc). */
  detail?: string;
  /** Free-form line between the detail and the actions row (e.g. a countdown). */
  note?: ReactNode;
  actions?: FlagAction[];
  /** Extra items appended to the same actions row — for stateful controls
   *  (e.g. `ScheduleResumeMenu`) that don't fit the plain label/onClick shape. */
  extraActions?: ReactNode;
  /** Extra content below the actions row — e.g. an expanded scheduling picker. */
  children?: ReactNode;
}) {
  const color = TONE_COLOR[tone];
  return (
    <div
      className="flex items-start gap-[10px] rounded-[12px] px-[14px] py-3"
      style={{ background: TONE_BG[tone] }}
    >
      <span className="shrink-0 mt-[1px]" style={{ color }}>
        <Icon name={icon} size={13} />
      </span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-[9px]">
          <span className="font-semibold text-[13.5px] whitespace-nowrap" style={{ color }}>{title}</span>
          {pill && <span className="font-mono text-[10.5px] opacity-85 whitespace-nowrap" style={{ color }}>{pill}</span>}
        </div>
        <div className="text-ao-fg-3 text-[12.5px] mt-[3px] leading-[1.5]">{body}</div>
        {detail && (
          <div className="text-ao-fg-3 text-[11px] mt-1 font-mono break-words line-clamp-3">{detail}</div>
        )}
        {note}
        {((actions && actions.length > 0) || extraActions) && (
          <div className="mt-2 flex flex-wrap items-center gap-4">
            {actions?.map((a) =>
              a.href ? (
                <a
                  key={a.key}
                  href={a.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[11.5px] font-semibold whitespace-nowrap no-underline hover:underline"
                  style={{ color: ACTION_COLOR[a.tone] }}
                >
                  {a.label}
                </a>
              ) : (
                <button
                  key={a.key}
                  type="button"
                  onClick={a.onClick}
                  disabled={a.disabled || !a.onClick}
                  className="text-[11.5px] font-semibold whitespace-nowrap bg-transparent border-0 p-0 cursor-pointer hover:underline disabled:opacity-40 disabled:cursor-default disabled:hover:no-underline"
                  style={{ color: ACTION_COLOR[a.tone] }}
                >
                  {a.label}
                </button>
              ),
            )}
            {extraActions}
          </div>
        )}
        {children}
      </div>
    </div>
  );
}
