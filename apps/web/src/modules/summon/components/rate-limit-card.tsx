"use client";

import { useEffect, useMemo, useState } from "react";
import { useClaudeLimitsStore, periodStart, periodEnd } from "@/lib/claude-limits-store";
import { useRuns } from "@/modules/runs/hooks/use-runs";
import { formatCountdown } from "../format/format-countdown";
import { FlagCard, type FlagAction } from "./flag-card";

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
 *
 * Action colors follow intent, not the card's severity: "Stop agent" is
 * always destructive-red, "Retry"/"Continue" is always the accent
 * fix-it-and-move-on color, and "Resume when limit resets" is always
 * neutral — an amber warning card shouldn't turn its "Continue" link amber.
 */
export function RateLimitCard({ message, resetsAt, severity = "limit", onStop, onDismiss, onSchedule }: RateLimitCardProps) {
  const usageLabel = useRateLimitUsageLabel();
  const secsLeft = useRateLimitCountdown(resetsAt);
  const isLimit = severity === "limit";
  const [scheduled, setScheduled] = useState(false);
  const handleSchedule = onSchedule
    ? () => { onSchedule(); setScheduled(true); }
    : undefined;

  const actions: FlagAction[] = [
    { key: "stop", label: "Stop agent", tone: "danger", onClick: onStop, disabled: !onStop },
    { key: "continue", label: isLimit ? "Retry" : "Continue", tone: "primary", onClick: onDismiss, disabled: !onDismiss },
    ...(onSchedule
      ? [{ key: "schedule", label: scheduled ? "Resume scheduled" : "Resume when limit resets", tone: "neutral", onClick: handleSchedule, disabled: scheduled } satisfies FlagAction]
      : []),
  ];

  return (
    <FlagCard
      tone={isLimit ? "err" : "warn"}
      icon="alert-circle"
      title={isLimit ? "Rate limited" : "Approaching rate limit"}
      pill={usageLabel}
      body={message}
      note={
        secsLeft !== null && secsLeft > 0 ? (
          <div className="mt-[3px] font-mono text-[11.5px] text-ao-fg-3">
            Resets in <span style={{ color: isLimit ? "var(--ao-bad)" : "var(--ao-warn)" }}>{formatCountdown(secsLeft)}</span>
          </div>
        ) : null
      }
      actions={actions}
    />
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
