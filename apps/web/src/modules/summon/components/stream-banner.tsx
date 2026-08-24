"use client";

import { Button } from "@/components/ui/button";

export type BannerAction = { label: string; onClick: () => void };

export type StreamBannerProps = {
  // "muted" is a calm, non-alarming state (e.g. an agent that's just quiet while
  // thinking) — neutral colours, no bold, no red/yellow screaming.
  kind: "muted" | "warn" | "error";
  title: string;
  detail?: string;
  primary?: BannerAction;
  secondary?: BannerAction;
};

/**
 * Inline alert strip rendered between the chat head and thread. Verbose by
 * design — this app is for developers, so the user sees the actual error
 * string, the run id, and a primary action they can take.
 */
export function StreamBanner({ kind, title, detail, primary, secondary }: StreamBannerProps) {
  const colour =
    kind === "error" ? "var(--error)" : kind === "warn" ? "var(--queued)" : "var(--txt-3)";
  const background =
    kind === "error"
      ? "color-mix(in oklch, var(--error) 10%, transparent)"
      : kind === "warn"
        ? "color-mix(in oklch, var(--queued) 12%, transparent)"
        : "transparent";
  const border = kind === "muted" ? "var(--line-2)" : colour;
  return (
    <div
      role={kind === "muted" ? "status" : "alert"}
      className="mx-6 mt-2 p-[10px_12px] rounded-lg flex items-start gap-3"
      style={{ border: `1px solid ${border}`, background }}
    >
      <div className="flex-1 min-w-0">
        <div
          className={kind === "muted" ? "text-[13px] font-medium" : "text-[13px] font-semibold"}
          style={{ color: kind === "muted" ? "var(--txt-2)" : colour }}
        >
          {title}
        </div>
        {detail ? (
          <div className="mt-[3px] text-[11.5px] text-txt-2 font-[var(--font-mono)] break-words">
            {detail}
          </div>
        ) : null}
      </div>
      <div className="flex gap-1.5 shrink-0">
        {secondary ? (
          <Button variant="ghost" size="sm" onClick={secondary.onClick}>
            {secondary.label}
          </Button>
        ) : null}
        {primary ? (
          <Button size="sm" onClick={primary.onClick} style={{ borderColor: colour, color: colour }}>
            {primary.label}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
