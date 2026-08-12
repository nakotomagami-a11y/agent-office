"use client";

/**
 * Panel chrome for the analytics page.
 *
 * Deliberately minimal: a hairline border, a quiet header row, no icon
 * badge and no coloured accent tick. The old modal put a 3x14px purple bar
 * before every heading — pure decoration that made four unrelated sections
 * look like a template. Hierarchy here comes from type weight alone.
 */

import type { ReactNode } from "react";

export type PanelProps = {
  title: string;
  sub?: string;
  right?: ReactNode;
  children: ReactNode;
  /** Stretch to fill the flex row — keeps side-by-side panels equal height. */
  grow?: boolean;
};

export function Panel({ title, sub, right, children, grow }: PanelProps) {
  return (
    <section
      className={`bg-bg-1 border border-line rounded-lg flex flex-col overflow-hidden ${
        grow ? "flex-1" : ""
      }`}
    >
      <header className="flex items-center gap-[10px] px-[18px] py-[12px] border-b border-line">
        <h2 className="m-0 text-[13px] font-bold text-txt leading-none">{title}</h2>
        {sub && <span className="font-mono text-[10.5px] text-[var(--an-muted)] leading-none">{sub}</span>}
        {right && <div className="ml-auto">{right}</div>}
      </header>
      <div className="px-[18px] py-[16px] flex-1 flex flex-col">{children}</div>
    </section>
  );
}
