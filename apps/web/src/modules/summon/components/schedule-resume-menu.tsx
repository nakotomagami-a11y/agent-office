"use client";

import { useState } from "react";
import { Icon } from "@/components/ui/icon";
import { DateTimePicker } from "@/components/ui/date-time-picker";
import { ACCENT_BTN } from "@/lib/button-styles";
import { useClaudeLimitsStore, periodEnd } from "@/lib/claude-limits-store";

function fmt(ms: number): string {
  return new Date(ms).toLocaleString([], {
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Schedule-resume control for the error / interrupted card. Expands inline
 * (no popover — so the designed DateTimePicker's own portal doesn't fight an
 * outer popover's outside-click) into two choices: the prominent, recommended
 * "resume when my limit resets" hero button, or a specific time via the app's
 * themed DateTimePicker. Once scheduled it locks to a static confirmation.
 */
export function ScheduleResumeMenu({
  resetsAtMs,
  onSchedule,
  scheduled,
  onScheduled,
}: {
  /** Reset time from a rate-limit event (ms), if one was seen in this thread. */
  resetsAtMs?: number | null;
  onSchedule: (fireAtMs: number) => void;
  scheduled: boolean;
  onScheduled: () => void;
}) {
  const period = useClaudeLimitsStore((s) => s.period);
  const [open, setOpen] = useState(false);
  const [custom, setCustom] = useState("");

  // Best-known reset time: a live rate-limit reset, else the quota period end.
  const resetMs = resetsAtMs && resetsAtMs > Date.now() ? resetsAtMs : periodEnd(period);

  const commit = (ms: number) => {
    if (!Number.isFinite(ms) || ms <= Date.now()) return;
    onSchedule(ms);
    onScheduled();
    setOpen(false);
  };

  if (scheduled) {
    return (
      <span className="text-ao-fg-2 text-[12px] inline-flex items-center gap-1 opacity-80">
        <Icon name="check" size={11} /> Resume scheduled
      </span>
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-ao-fg-2 text-[12px] cursor-pointer inline-flex items-center gap-1 bg-transparent border-0 p-0 hover:text-ao-fg-0"
      >
        <Icon name="activity" size={11} /> Schedule resume
      </button>
    );
  }

  const customMs = custom ? new Date(custom).getTime() : NaN;
  const customValid = Number.isFinite(customMs) && customMs > Date.now();

  return (
    <div className="w-full mt-1 flex flex-col gap-[12px] rounded-[8px] border border-ao-line-1 bg-ao-bg-2 p-[12px]">
      <div className="flex items-center justify-between">
        <span className="text-[10.5px] font-mono uppercase tracking-[0.06em] text-ao-fg-3">Resume when?</span>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-ao-fg-3 text-[11.5px] cursor-pointer bg-transparent border-0 p-0 hover:text-ao-fg-1"
        >
          Cancel
        </button>
      </div>

      {/* Recommended hero option */}
      <button
        type="button"
        onClick={() => commit(resetMs)}
        className={`w-full flex items-center justify-between gap-[10px] px-[14px] py-[10px] rounded-[9px] text-[13px] font-semibold cursor-pointer ${ACCENT_BTN}`}
      >
        <span className="inline-flex items-center gap-[7px]">
          <Icon name="activity" size={13} /> Resume when my limit resets
        </span>
        <span className="font-mono text-[12px] opacity-90">{fmt(resetMs)}</span>
      </button>

      {/* Specific time — designed picker + confirm */}
      <div className="flex items-center gap-[8px]">
        <span className="text-[12px] text-ao-fg-2 shrink-0">Or pick a time</span>
        <div className="flex-1 min-w-0">
          <DateTimePicker value={custom} onChange={setCustom} ariaLabel="Pick a resume time" />
        </div>
        <button
          type="button"
          disabled={!customValid}
          onClick={() => commit(customMs)}
          className="shrink-0 inline-flex items-center h-8 px-[12px] rounded-[8px] text-[12px] font-medium cursor-pointer bg-ao-bg-3 border border-ao-line-1 text-ao-fg-1 hover:bg-ao-bg-4 hover:text-ao-fg-0 disabled:opacity-40 disabled:cursor-default"
        >
          Schedule
        </button>
      </div>
    </div>
  );
}
