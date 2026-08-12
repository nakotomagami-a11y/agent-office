"use client";

import { useEffect, useMemo, useState } from "react";
import { Icon } from "@/components/ui/icon";
import { useClaudeLimitsStore, periodStart, periodEnd } from "@/lib/claude-limits-store";
import { useRuns } from "@/modules/runs/hooks/use-runs";
import { formatCountdown } from "../format/format-countdown";

export type RateLimitCardProps = {
  message: string;
  resetsAt?: number;
  /**
   * "warning" = approaching the limit (run keeps going, dismiss & continue).
   * "limit" = hard-limited (run stopped). Defaults to "limit" for safety.
   */
  severity?: "warning" | "limit";
  onStop?: () => void;
  onDismiss?: () => void;
  /** Schedule a server-side auto-resume when the limit resets. */
  onSchedule?: () => void;
};

/**
 * Card shown in the chat thread on a Claude rate-limit signal. An early
 * WARNING (amber, "approaching") keeps the run going — the user can dismiss
 * and continue. A hard LIMIT (red, "hit") means the run stopped. Displays
 * current budget usage and a live countdown to reset.
 */
export function RateLimitCard({ message, resetsAt, severity = "limit", onStop, onDismiss, onSchedule }: RateLimitCardProps) {
  const usageLabel = useRateLimitUsageLabel();
  const secsLeft = useRateLimitCountdown(resetsAt);
  const isLimit = severity === "limit";
  const [scheduled, setScheduled] = useState(false);
  const handleSchedule = onSchedule
    ? () => { onSchedule(); setScheduled(true); }
    : undefined;
  return (
    <div
      className={
        isLimit
          ? "border border-[rgba(239,68,68,0.30)] border-l-[3px] border-l-[#dc2626] rounded-[8px] px-[14px] py-3 bg-[rgba(239,68,68,0.05)] flex items-start gap-[10px]"
          : "border border-[rgba(234,179,8,0.30)] border-l-[3px] border-l-[#ca8a04] rounded-[8px] px-[14px] py-3 bg-[rgba(234,179,8,0.05)] flex items-start gap-[10px]"
      }
    >
      <RateLimitIcon isLimit={isLimit} />
      <div className="flex-1 min-w-0">
        <RateLimitHeader usageLabel={usageLabel} isLimit={isLimit} />
        <div className="text-ao-fg-1 text-[12.5px] mt-0.5 font-mono leading-[1.5]">{message}</div>
        {secsLeft !== null && secsLeft > 0 ? (
          <div className="mt-[4px] font-mono text-[11.5px] text-ao-fg-3">
            Resets in <span className={isLimit ? "text-[#dc2626]" : "text-[#ca8a04]"}>{formatCountdown(secsLeft)}</span>
          </div>
        ) : null}
        <RateLimitActions onStop={onStop} onDismiss={onDismiss} onSchedule={handleSchedule} scheduled={scheduled} isLimit={isLimit} />
      </div>
    </div>
  );
}

/**
 * Compute the current billing-period label ("used 42%" or "$0.83 spent")
 * from the runs store and the configured Claude limits.
 */
function useRateLimitUsageLabel(): string {
  const quotaUsd = useClaudeLimitsStore((s) => s.quotaUsd);
  const period = useClaudeLimitsStore((s) => s.period);
  const runsQ = useRuns({ limit: 500 });
  const allRuns = useMemo(() => runsQ.data ?? [], [runsQ.data]);
  return useMemo(() => {
    const start = periodStart(period);
    const end = periodEnd(period);
    const cost = allRuns.filter((r) => r.ts >= start && r.ts < end).reduce((s, r) => s + (r.cost || 0), 0);
    if (quotaUsd > 0) {
      const pct = Math.round((cost / quotaUsd) * 100);
      return `used ${pct}%`;
    }
    return `$${cost.toFixed(2)} spent`;
  }, [allRuns, quotaUsd, period]);
}

/** Second-precision live countdown driven by resetsAt (unix seconds). */
function useRateLimitCountdown(resetsAt: number | undefined): number | null {
  const [secsLeft, setSecsLeft] = useState<number | null>(
    resetsAt ? Math.max(0, resetsAt - Math.floor(Date.now() / 1000)) : null,
  );
  useEffect(() => {
    if (secsLeft === null || secsLeft <= 0) return;
    const id = setInterval(() => setSecsLeft((s) => (s !== null && s > 0 ? s - 1 : 0)), 1000);
    return () => clearInterval(id);
  }, [secsLeft]);
  return secsLeft;
}

function RateLimitIcon({ isLimit }: { isLimit: boolean }) {
  return (
    <div className={`w-[22px] h-[22px] flex items-center justify-center rounded-[6px] shrink-0 ${isLimit ? "bg-[rgba(239,68,68,0.12)] text-[#dc2626]" : "bg-[rgba(234,179,8,0.12)] text-[#ca8a04]"}`}>
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
      </svg>
    </div>
  );
}

function RateLimitHeader({ usageLabel, isLimit }: { usageLabel: string; isLimit: boolean }) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="font-semibold text-ao-fg-0 text-[13.5px]">{isLimit ? "Rate limited" : "Approaching rate limit"}</span>
      <span className={`font-mono text-[11px] px-[6px] py-[2px] rounded-full ${isLimit ? "bg-[rgba(239,68,68,0.12)] text-[#dc2626]" : "bg-[rgba(234,179,8,0.12)] text-[#ca8a04]"}`}>{usageLabel}</span>
    </div>
  );
}

function RateLimitActions({ onStop, onDismiss, onSchedule, scheduled, isLimit }: { onStop: (() => void) | undefined; onDismiss: (() => void) | undefined; onSchedule: (() => void) | undefined; scheduled: boolean; isLimit: boolean }) {
  return (
    <div className="mt-2 flex items-center gap-3 flex-wrap">
      <button
        onClick={onStop}
        disabled={!onStop}
        className="text-[var(--ao-bad)] text-[12px] cursor-pointer inline-flex items-center gap-1 bg-transparent border-0 p-0 disabled:opacity-40 disabled:cursor-default"
      >
        <Icon name="stop" size={11} /> Stop agent
      </button>
      <button
        onClick={onDismiss}
        disabled={!onDismiss}
        className={`text-[12px] cursor-pointer inline-flex items-center gap-1 bg-transparent border-0 p-0 disabled:opacity-40 disabled:cursor-default ${isLimit ? "text-[#dc2626]" : "text-[#ca8a04]"}`}
      >
        <Icon name="refresh" size={11} /> {isLimit ? "Retry" : "Continue"}
      </button>
      {onSchedule ? (
        <button
          onClick={onSchedule}
          disabled={scheduled}
          className="text-ao-fg-2 text-[12px] cursor-pointer inline-flex items-center gap-1 bg-transparent border-0 p-0 disabled:opacity-60 disabled:cursor-default"
        >
          <Icon name={scheduled ? "check" : "activity"} size={11} /> {scheduled ? "Resume scheduled" : "Resume when limit resets"}
        </button>
      ) : null}
    </div>
  );
}
