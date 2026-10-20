"use client";

import type { ClaudePlan } from "@agent-office/domain/types";
import { cn } from "@/lib/cn";

type BadgePlan = ClaudePlan | "unknown";

const PLAN_LABEL: Record<BadgePlan, string> = {
  max: "Max",
  pro: "Pro",
  free: "Free",
  api: "API",
  custom: "Custom",
  unknown: "—",
};

const PLAN_CLASS: Record<BadgePlan, string> = {
  max: "border-[color-mix(in_oklch,var(--done)_40%,transparent)] text-status-done bg-[color-mix(in_oklch,var(--done)_10%,transparent)]",
  pro: "border-[color-mix(in_oklch,var(--acc)_40%,transparent)] text-acc bg-[color-mix(in_oklch,var(--acc)_10%,transparent)]",
  free: "border-line text-txt-3 bg-bg-2",
  api: "border-line text-txt-3 bg-bg-2",
  custom: "border-line text-txt-3 bg-bg-2",
  unknown: "border-line text-txt-3 bg-bg-2",
};

export function PlanBadge({ plan, className }: { plan: BadgePlan; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center h-[18px] px-[6px] rounded-[4px] border font-mono text-[10.5px] uppercase tracking-[0.06em] leading-none",
        PLAN_CLASS[plan],
        className,
      )}
    >
      {PLAN_LABEL[plan]}
    </span>
  );
}
