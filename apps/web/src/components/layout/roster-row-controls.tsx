"use client";

import type { ButtonHTMLAttributes, KeyboardEvent, ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * Small reusable building blocks shared by the roster sidebar's agent row
 * (`roster-group.tsx`) and its expanded session tree (`roster-instance-row.tsx`).
 * Components, not className-string constants — so the markup and its styling
 * stay together and each piece is independently reusable/composable instead
 * of being a string that has to be remembered to pair with the right JSX shape.
 */

// ── Action button (pin / spawn / remove / rename) ──────────────────────────

export type RosterActionButtonProps = {
  /** Danger tint on hover (used by "remove"). Defaults to the accent tint
   *  used by pin/spawn/rename. */
  tone?: "accent" | "danger";
  /** Pin-specific "currently active" look: filled accent, always visible
   *  (not hover-gated). */
  active?: boolean;
} & ButtonHTMLAttributes<HTMLButtonElement>;

export function RosterActionButton({ tone = "accent", active, className, type = "button", ...rest }: RosterActionButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        "w-[22px] h-[22px] rounded-[6px] inline-flex items-center justify-center cursor-pointer",
        "transition-[background-color,color] duration-[120ms]",
        "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-acc",
        active
          ? "text-acc bg-acc-faint opacity-100 hover:bg-acc-tint"
          : tone === "danger"
            ? "text-txt-3 hover:bg-[color-mix(in_oklab,var(--error)_16%,transparent)] hover:text-[var(--error)]"
            : "text-txt-3 hover:bg-acc-faint hover:text-acc",
        className,
      )}
      {...rest}
    />
  );
}

// ── Session tree row ────────────────────────────────────────────────────────

export type RosterSessionRowProps = {
  /** Selected/current session — filled background + the glowing trunk dot. */
  active?: boolean;
  /** Omit for a non-interactive row (e.g. the rename text input): no button
   *  role, no click/keyboard handling gets attached. */
  onClick?: () => void;
  "aria-label"?: string;
  children: ReactNode;
  className?: string;
};

/**
 * One row in the expanded roster tree (a session, or the trailing "New
 * session" row). Draws the horizontal tick connecting it to the tree's
 * vertical trunk line (see the `before:` on the sessions wrapper in
 * `roster-group.tsx`), and — when `active` — a small glowing dot in the
 * same spot instead, so it reads as "the tick, lit up". `group` here pairs
 * with `RosterSessionActions`' `group-hover:` below to reveal hover actions.
 */
export function RosterSessionRow({ active, onClick, "aria-label": ariaLabel, children, className }: RosterSessionRowProps) {
  const interactive = !!onClick;
  return (
    <div
      aria-label={ariaLabel}
      className={cn(
        "group relative flex items-center gap-[10px] px-[10px] py-[6px] rounded-[6px] text-txt-2 hover:bg-bg-3",
        "before:content-[''] before:absolute before:left-[-14px] before:top-1/2 before:w-[10px] before:h-px before:bg-line-2",
        interactive && "cursor-pointer",
        active && [
          "bg-acc-faint text-txt",
          "after:content-[''] after:absolute after:left-[-14px] after:top-1/2 after:-translate-y-1/2 after:w-[5px] after:h-[5px] after:rounded-full after:bg-acc after:shadow-[0_0_4px_var(--acc)]",
        ],
        className,
      )}
      onClick={onClick}
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
}

/** Hover-reveal action cluster, absolutely positioned over a `RosterSessionRow`. */
export function RosterSessionActions({ children }: { children: ReactNode }) {
  return (
    <div className="absolute right-[6px] top-1/2 -translate-y-1/2 flex gap-px p-[2px] bg-bg-1 border border-line-2 rounded-[6px] opacity-0 transition-opacity duration-[120ms] group-hover:opacity-100">
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
        "w-[22px] h-[22px] rounded-[4px] flex items-center justify-center text-txt-3 bg-transparent border-0 cursor-pointer hover:bg-bg-3",
        danger ? "hover:text-status-error" : "hover:text-txt",
        className,
      )}
      {...rest}
    />
  );
}
