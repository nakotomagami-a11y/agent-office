"use client";

/**
 * Agent leaderboard.
 *
 * Uses the real Tiny Swords sprite for each agent rather than an initial in
 * a circle — the sprite is how every other surface in the app identifies an
 * agent, and a lettered avatar here reads as a stock dashboard component.
 *
 * One proportional encoding only (the cost bar). The old version drew a bar
 * *and* a percentage *and* a cost, which is three renderings of one fact and
 * degenerates into a column of "0%" once the tail is reached.
 */

import type { AgentRow } from "../hooks/use-analytics-page";
import { UnitSprite } from "@/components/ui/unit-sprite";
import { unitForAgent } from "@/components/ui/unit-sprite-registry";
import { usd, duration, compact } from "../format/format";

export type AgentTableProps = { rows: AgentRow[] };

export function AgentTable({ rows }: AgentTableProps) {
  if (rows.length === 0) {
    return <p className="m-0 text-[12px] text-txt-2 py-[10px]">No runs in this window.</p>;
  }
  const maxCost = Math.max(...rows.map((r) => r.cost), 1e-6);

  return (
    <div className="flex flex-col">
      {rows.map((r, i) => {
        const errPct = r.runs > 0 ? (r.errors / r.runs) * 100 : 0;
        // Only call out reliability once it's actually notable.
        const flagged = errPct >= 15 && r.runs >= 5;
        return (
          <div
            key={r.agentId}
            className="flex items-center gap-[12px] py-[9px] border-b border-line last:border-b-0"
          >
            <span className="w-[14px] shrink-0 font-mono text-[10px] text-[var(--an-muted)] tabular-nums text-right">
              {i + 1}
            </span>

            <span className="shrink-0" aria-hidden>
              <UnitSprite unit={unitForAgent(r.agentId)} size={26} />
            </span>

            <div className="flex flex-col min-w-0 flex-1 gap-[5px]">
              <div className="flex items-baseline gap-[8px] min-w-0">
                <span className="text-[13px] font-semibold text-txt truncate leading-none">
                  {r.agentName}
                </span>
                {flagged && (
                  <span className="font-mono text-[9.5px] text-status-error shrink-0 leading-none">
                    {errPct.toFixed(0)}% failed
                  </span>
                )}
              </div>
              {/* proportional cost bar — the only bar in the row */}
              <div className="h-[5px] rounded-full bg-bg-2 overflow-hidden">
                {/* Square-root scale: on a linear one the top agent takes
                    100% and everyone below the runner-up collapses into an
                    indistinguishable stub. Width is per-datum, so it is the
                    only thing set from JS; the fill is a class. */}
                <div
                  className="h-full rounded-full an-fill-cell"
                  style={{ width: `${Math.max(4, Math.sqrt(r.cost / maxCost) * 100)}%` }}
                />
              </div>
            </div>

            <div className="flex flex-col items-end shrink-0 w-[52px]">
              <span className="font-mono text-[11.5px] text-txt-2 tabular-nums leading-none">
                {compact(r.runs)}
              </span>
              <span className="font-mono text-[9.5px] text-[var(--an-muted)] mt-[3px]">runs</span>
            </div>

            <div className="flex flex-col items-end shrink-0 w-[52px]">
              <span className="font-mono text-[11.5px] text-txt-2 tabular-nums leading-none">
                {duration(r.runtimeMs)}
              </span>
              <span className="font-mono text-[9.5px] text-[var(--an-muted)] mt-[3px]">active</span>
            </div>

            <span className="font-mono text-[13px] font-semibold text-txt tabular-nums shrink-0 w-[64px] text-right">
              {usd(r.cost)}
            </span>
          </div>
        );
      })}
    </div>
  );
}
