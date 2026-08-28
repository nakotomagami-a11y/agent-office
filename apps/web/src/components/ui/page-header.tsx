import type React from "react";

/**
 * Reusable page header — used across every top-level app route so the
 * headline styling stays consistent (Agents, Memory, Skills, etc.). Big
 * borderless H1 with a baseline-aligned mono sub label and a right-aligned
 * actions slot — matches the V3 mockups' shared page-header pattern.
 *
 * Structural — no page-specific state. Content-agnostic so any route
 * can drop it in without pulling in unrelated hooks.
 */
type PageHeaderProps = {
  title: React.ReactNode;
  sub?: React.ReactNode;
  actions?: React.ReactNode;
};

export function PageHeader({ title, sub, actions }: PageHeaderProps) {
  return (
    // `max-[900px]:flex-wrap` lets a busy actions cluster (several pages now
    // pack in 3-4 controls — view toggle, scope pill, segmented tabs, export)
    // drop to its own row instead of squeezing the title down to nothing on
    // narrower windows. Found during the Phase 10 responsive sweep.
    <div className="shrink-0 flex items-center max-[900px]:flex-wrap gap-[12px] px-[20px] pt-[16px]">
      <div className="flex items-end gap-[12px] min-w-0 shrink-0">
        <h1 className="m-0 text-[30px] font-extrabold tracking-[-0.035em] whitespace-nowrap">{title}</h1>
        {sub && (
          <span className="font-[var(--font-mono)] text-[11.5px] text-txt-4 pb-[6px] whitespace-nowrap">
            {sub}
          </span>
        )}
      </div>
      {actions && (
        <>
          <span className="flex-1 max-[900px]:hidden" />
          <div className="flex items-center flex-wrap gap-[8px]">{actions}</div>
        </>
      )}
    </div>
  );
}
