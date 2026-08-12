// Pure presentation helpers for the chat phase indicator.

import type { ChatPhase } from "../components/live-status";

export function fmtElapsed(sec: number): string {
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  if (m < 60) return s > 0 ? `${m}m ${s}s` : `${m}m`;
  const h = Math.floor(m / 60);
  const rm = m % 60;
  return rm > 0 ? `${h}h ${rm}m` : `${h}h`;
}

export function phaseHint(
  phase: ChatPhase,
  usage: { tokensIn: number; tokensOut: number; cost: number },
): string | undefined {
  if (phase === "streaming") {
    return `${usage.tokensOut.toLocaleString()} tok · $${usage.cost.toFixed(3)}`;
  }
  if (phase === "done") {
    return `${(usage.tokensIn + usage.tokensOut).toLocaleString()} tok · $${usage.cost.toFixed(3)}`;
  }
  return undefined;
}
