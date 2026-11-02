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

const SOLID_CLASS: Record<BadgePlan, string> = {
  max: "bg-green text-[#06140d]",
  pro: "bg-acc text-acc-ink",
  free: "bg-card-3 text-txt-3",
  api: "bg-card-3 text-txt-3",
  custom: "bg-card-3 text-txt-3",
  unknown: "bg-card-3 text-txt-3",
};

export function PlanBadge({ plan, solid, className }: { plan: BadgePlan; solid?: boolean; className?: string }) {
  return (
    <span
      className={cn(
        solid
          ? "inline-flex items-center shrink-0 h-[20px] px-[8px] rounded-full font-mono text-[10px] font-bold uppercase tracking-[0.06em] leading-none"
          : "inline-flex items-center h-[18px] px-[6px] rounded-[4px] border font-mono text-[10.5px] uppercase tracking-[0.06em] leading-none",
        solid ? SOLID_CLASS[plan] : PLAN_CLASS[plan],
        className,
      )}
    >
      {PLAN_LABEL[plan]}
    </span>
  );
}
