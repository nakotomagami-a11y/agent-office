"use client";

import { forwardRef, type ButtonHTMLAttributes, type KeyboardEvent, type ReactNode } from "react";
import type { AgentStatusInfo } from "@/modules/office/derive/derive-status";
import { cn } from "@/lib/cn";

/**
 * Small reusable building blocks shared by the roster sidebar's agent row
 * (`roster-group.tsx`) and its expanded session tree (`roster-instance-row.tsx`).
 * Components, not className-string constants — so the markup and its styling
 * stay together and each piece is independently reusable/composable instead
 * of being a string that has to be remembered to pair with the right JSX shape.
 */

/** Statuses that render as "live" (pulsing working LED) across the roster tree. */
export const LIVE_STATUSES: AgentStatusInfo["status"][] = ["working", "thinking"];

/** Ascending urgency — later entries win when folding several instances'
 *  statuses into one (the group row's LED, the quick-view roll-up badge). */
export const STATUS_PRIORITY: AgentStatusInfo["status"][] = [
  "idle", "done", "queued", "thinking", "working", "error",
];

/** Folds a list of per-instance statuses into the single most-urgent one. */
export function aggregateStatus(statuses: AgentStatusInfo["status"][]): AgentStatusInfo["status"] {
  let best: AgentStatusInfo["status"] = "idle";
  for (const s of statuses) {
    if (STATUS_PRIORITY.indexOf(s) > STATUS_PRIORITY.indexOf(best)) best = s;
  }
  return best;
}

// ── Action button (pin / spawn / remove / rename) ──────────────────────────

export type RosterActionButtonProps = {
  /** Danger tint on hover (used by "remove"); otherwise a neutral card tint. */
  tone?: "accent" | "danger";
  /** Pin-specific "currently active" look: accent on an accent-soft square. */
  active?: boolean;
} & ButtonHTMLAttributes<HTMLButtonElement>;

export function RosterActionButton({ tone = "accent", active, className, type = "button", ...rest }: RosterActionButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        "w-[20px] h-[20px] rounded-[6px] inline-flex items-center justify-center cursor-pointer",
        "transition-[background-color,color] duration-[130ms]",
        "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-acc",
        active
          ? "text-acc bg-acc-soft"
          : tone === "danger"
            ? "text-txt-4 hover:bg-red-soft hover:text-red"
            : "text-txt-4 hover:bg-card-3 hover:text-txt",
        className,
      )}
      {...rest}
    />
  );
}

// ── Session tree row ────────────────────────────────────────────────────────

export type RosterSessionRowProps = {
  /** Selected/current session — filled background. */
  active?: boolean;
  /** Omit for a non-interactive row (e.g. the rename text input): no button
   *  role, no click/keyboard handling gets attached. */
  onClick?: () => void;
  /** Forwarded straight onto the row's own div — lets `AgentQuickView`'s
   *  render-prop attach its hover trigger without an extra wrapper box
   *  (see that component's doc comment for why a wrapper broke hover). */
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
  "aria-label"?: string;
  children: ReactNode;
  className?: string;
};

/**
 * One row in the expanded roster tree (a session, or the trailing "New
 * session" row). `group` here pairs with `RosterSessionActions`'
 * `group-hover:` below to reveal hover actions.
 */
export const RosterSessionRow = forwardRef<HTMLDivElement, RosterSessionRowProps>(function RosterSessionRow(
  { active, onClick, onMouseEnter, onMouseLeave, "aria-label": ariaLabel, children, className },
  ref,
) {
  const interactive = !!onClick;
  return (
    <div
      ref={ref}
      aria-label={ariaLabel}
      className={cn(
        "group relative flex items-center gap-[8px] px-[8px] py-[5px] rounded-[8px] text-txt-2 transition-colors duration-[130ms] hover:bg-card-2",
        interactive && "cursor-pointer",
        active && "bg-acc-faint text-txt",
        className,
      )}
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      role={interactive ? "button" : undefined}
      tabIndex={interactive ? 0 : undefined}
      onKeyDown={
        interactive
          ? (e: KeyboardEvent) => {
              if (e.key === "Enter" || e.key === " ") onClick();
            }
          : undefined
      }
    >
      {children}
    </div>
  );
});

/** Hover-reveal action cluster, absolutely positioned over a `RosterSessionRow`. */
export function RosterSessionActions({ children }: { children: ReactNode }) {
  return (
    <div className="absolute right-[4px] top-1/2 -translate-y-1/2 flex gap-px p-[2px] bg-card border border-edge-2 rounded-[8px] shadow-[var(--lift)] opacity-0 transition-opacity duration-[120ms] group-hover:opacity-100 group-focus-within:opacity-100">
      {children}
    </div>
  );
}

/** One icon button inside `RosterSessionActions` (rename / remove). */
export function RosterSessionActionButton({ danger, className, type = "button", ...rest }: { danger?: boolean } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type={type}
      className={cn(
        "w-[20px] h-[20px] rounded-[6px] flex items-center justify-center text-txt-4 bg-transparent border-0 cursor-pointer transition-colors duration-[130ms]",
        danger ? "hover:bg-red-soft hover:text-red" : "hover:bg-card-3 hover:text-txt",
        className,
      )}
      {...rest}
    />
  );
}
