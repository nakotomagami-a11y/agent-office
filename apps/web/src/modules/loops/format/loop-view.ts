// Presentation derivations for a loop. Pure — no React, so the numbers the UI
// shows are testable without rendering.

import type { LoopRow } from "@agent-office/domain/services/db/loops";
import { canAcceptAsIs } from "@agent-office/domain/services/execution/loop-machine";
import type { Finding, LoopPhase } from "@agent-office/domain/services/execution/loop-machine";

const PHASE_LABEL: Record<LoopPhase, string> = {
  authoring: "Writing",
  reviewing: "Reviewing",
  fixing: "Fixing",
  done: "Converged",
  escalated: "Needs you",
};

export function phaseLabel(p: LoopPhase): string {
  return PHASE_LABEL[p] ?? p;
}

/** The BINDING ceiling is whichever is closest to its limit — the same one the
 *  machine will actually stop on, so the bar never disagrees with the verdict. */
export function ceilingPressure(loop: LoopRow): { label: string; fraction: number } {
  const { state, config } = loop;
  const bars = [
    { label: `round ${state.round}/${config.maxRounds}`, fraction: state.round / config.maxRounds },
  ];
  if (config.budgetUsd) {
    bars.push({
      label: `$${state.spentUsd.toFixed(2)} / $${config.budgetUsd.toFixed(2)}`,
      fraction: state.spentUsd / config.budgetUsd,
    });
  }
  return bars.reduce((a, b) => (b.fraction > a.fraction ? b : a));
}

const SEVERITY_ORDER = { "must-fix": 0, "should-fix": 1, nit: 2 } as const;

export function sortedOpen(loop: LoopRow): Finding[] {
  return [...loop.state.open].sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
}

/** Whether each intervention applies, mirroring the machine's ACCEPTS table.
 *  A button the machine would refuse must not be offered — the API answers 409
 *  for those, and a button that 409s is a button that lies. */
export function availableActions(loop: LoopRow, now: number): { stop: boolean; acceptAsIs: boolean; allowOneMore: boolean } {
  const { phase, binding, open, startedAt } = loop.state;
  const { wallClockMs } = loop.config;
  const live = phase === "authoring" || phase === "reviewing" || phase === "fixing";
  // Time-dependent: the wall clock keeps running while the loop sits escalated
  // waiting for a human, and `allowOneMore` past it does NOT refuse — it
  // terminates the loop and reports success. Offering it would be a button
  // that silently kills the thing it claims to extend.
  const timeLeft = wallClockMs === undefined || now - startedAt < wallClockMs;
  return {
    stop: live,
    acceptAsIs: canAcceptAsIs(loop.state),
    allowOneMore: phase === "escalated" && binding === "max_rounds" && open.length > 0 && timeLeft,
  };
}
