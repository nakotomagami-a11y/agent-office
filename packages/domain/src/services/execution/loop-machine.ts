/**
 * The Loop governor — PURE. No DB, no spawn, no `Date.now`, no `Math.random`.
 *
 * The agent drives each round's content; this owns the ceilings and escalation.
 * If the agent owned the loop nothing could stop it. Every termination names its
 * BINDING CONSTRAINT — "converged at 3 of 5" and "stopped at 5 of 5, 2 must-fix
 * open" are different decisions for the user.
 */

export type Severity = "must-fix" | "should-fix" | "nit";

export interface Finding {
  severity: Severity;
  /** Rule this cites. Required — a finding with no rule is an opinion. */
  ruleId: string;
  file?: string;
  line?: number;
  why: string;
}

export interface LoopConfig {
  /** Hard ceiling on author+review cycles. */
  maxRounds: number;
  /** Cumulative USD across every run in the loop. */
  budgetUsd?: number;
  /** Wall clock from loop start. Excludes nothing — a slow loop is still spend. */
  wallClockMs?: number;
  /** Severities that block convergence. Everything else is recorded only. */
  blockOn?: Severity[];
}

export type LoopPhase = "authoring" | "reviewing" | "fixing" | "done" | "escalated";

/** Why the loop stopped. Reported to the user verbatim. */
export type BindingConstraint =
  | "converged"
  | "max_rounds"
  | "budget"
  | "wall_clock"
  | "review_failed"
  | "author_failed"
  | "fix_failed"
  | "user_stopped"
  | "invalid_findings"
  /** The next round could not be spawned. Terminal, and names itself rather
   *  than leaving the loop stranded with no active run and no verdict. */
  | "dispatch_failed"
  /** The stored row could not be trusted. A termination must never be nameless. */
  | "corrupt_state";

export interface LoopState {
  phase: LoopPhase;
  /** 1-based. Incremented when a fix round starts, not when review does. */
  round: number;
  spentUsd: number;
  startedAt: number;
  /** Findings from the most recent review only — the fix prompt's input. */
  open: Finding[];
  /** Every finding seen, for the user's summary. */
  history: Finding[];
  binding?: BindingConstraint;
}

export type LoopAction =
  | { type: "authorFinished"; ok: boolean; costUsd: number }
  | { type: "reviewFinished"; ok: boolean; costUsd: number; findings: Finding[] }
  | { type: "fixFinished"; ok: boolean; costUsd: number }
  /** User chose to accept the work despite open findings. */
  | { type: "acceptAsIs" }
  /** User chose to allow one more round past the ceiling. */
  | { type: "allowOneMore" }
  | { type: "stop" };

export type LoopEffect =
  | { type: "startReview"; round: number }
  | { type: "startFix"; round: number; findings: Finding[] }
  | { type: "finish"; binding: BindingConstraint };

export interface LoopReduction {
  state: LoopState;
  effects: LoopEffect[];
}

const DEFAULT_BLOCKING: Severity[] = ["must-fix"];

/** Which actions each phase will accept. Anything else is ignored. */
const ACCEPTS: Record<LoopPhase, LoopAction["type"][]> = {
  authoring: ["authorFinished", "stop"],
  reviewing: ["reviewFinished", "stop", "acceptAsIs"],
  fixing: ["fixFinished", "stop", "acceptAsIs"],
  done: [],
  escalated: ["allowOneMore", "acceptAsIs"],
};

/** Hard bounds, in the DOMAIN. The API schema gives a 400; this is what makes
 *  "the app owns the ceilings" true for EVERY caller — the scheduler, an MCP
 *  tool, anything added later. A ceiling a caller can widen is not a ceiling. */
export const LOOP_LIMITS = { maxRounds: 20, budgetUsd: 1000, wallClockMs: 24 * 60 * 60 * 1000 } as const;

function clamp(v: number | undefined, hi: number): number | undefined {
  if (v === undefined) return undefined;
  if (!Number.isFinite(v) || v <= 0) return undefined;
  return Math.min(v, hi);
}

export function clampLoopConfig(cfg: LoopConfig): LoopConfig {
  const rounds = clamp(cfg.maxRounds, LOOP_LIMITS.maxRounds);
  return {
    ...cfg,
    maxRounds: rounds !== undefined && Number.isInteger(rounds) ? rounds : 1,
    budgetUsd: clamp(cfg.budgetUsd, LOOP_LIMITS.budgetUsd),
    wallClockMs: clamp(cfg.wallClockMs, LOOP_LIMITS.wallClockMs),
  };
}

export function initialLoopState(startedAt: number): LoopState {
  return { phase: "authoring", round: 1, spentUsd: 0, startedAt, open: [], history: [] };
}

function blocking(findings: Finding[], cfg: LoopConfig): Finding[] {
  const block = cfg.blockOn ?? DEFAULT_BLOCKING;
  return findings.filter((f) => block.includes(f.severity));
}

/** A finding with no citation is an opinion; reject the whole batch rather than
 *  silently dropping entries, so a miswired reviewer is loud. */
function citationsResolve(findings: Finding[], ruleExists: (id: string) => boolean): boolean {
  return findings.every((f) => f.ruleId.trim().length > 0 && ruleExists(f.ruleId));
}

function done(state: LoopState, binding: BindingConstraint): LoopReduction {
  const phase: LoopPhase = binding === "converged" ? "done" : "escalated";
  return { state: { ...state, phase, binding }, effects: [{ type: "finish", binding }] };
}

/**
 * Ceiling check, run before dispatching any further work. Returns the binding
 * constraint when one is hit, else null. Ordered cheapest-to-explain first.
 */
function ceilingHit(state: LoopState, cfg: LoopConfig, now: number): BindingConstraint | null {
  if (cfg.budgetUsd !== undefined && state.spentUsd >= cfg.budgetUsd) return "budget";
  if (cfg.wallClockMs !== undefined && now - state.startedAt >= cfg.wallClockMs) return "wall_clock";
  if (state.round >= cfg.maxRounds) return "max_rounds";
  return null;
}

export function reduceLoop(
  state: LoopState,
  action: LoopAction,
  cfg: LoopConfig,
  now: number,
  ruleExists: (id: string) => boolean = () => true,
): LoopReduction {
  // A finished loop is final. An ESCALATED one still accepts the two user
  // actions that exist to resolve it — otherwise `allowOneMore` is dead code,
  // which is exactly what it was.
  if (state.phase === "done") return { state, effects: [] };
  if (state.phase === "escalated" && action.type !== "allowOneMore" && action.type !== "acceptAsIs") {
    return { state, effects: [] };
  }

  // An action from the wrong phase is ignored. Without this, a duplicated or
  // out-of-order `fixFinished` dispatched review work without bound — the
  // ceiling was bypassable and every test passed, because none of them sent an
  // action out of phase.
  if (!ACCEPTS[state.phase].includes(action.type)) return { state, effects: [] };

  switch (action.type) {
    case "stop":
      return done({ ...state }, "user_stopped");

    case "acceptAsIs":
      return done({ ...state, open: [] }, "converged");

    case "allowOneMore": {
      // Raising the ROUND ceiling is the user's call. Budget and wall clock are
      // not negotiable here — re-check them so "one more" cannot spend past them.
      if (state.binding !== "max_rounds" || state.open.length === 0) return { state, effects: [] };
      const relaxed = { ...state, phase: "fixing" as LoopPhase, binding: undefined };
      if (cfg.budgetUsd !== undefined && relaxed.spentUsd >= cfg.budgetUsd) return done(state, "budget");
      if (cfg.wallClockMs !== undefined && now - relaxed.startedAt >= cfg.wallClockMs) return done(state, "wall_clock");
      const next = { ...relaxed, round: relaxed.round + 1 };
      return { state: next, effects: [{ type: "startFix", round: next.round, findings: state.open }] };
    }

    case "authorFinished":
    case "fixFinished": {
      const spent = state.spentUsd + action.costUsd;
      if (!action.ok) {
        return done({ ...state, spentUsd: spent }, action.type === "authorFinished" ? "author_failed" : "fix_failed");
      }
      const s = { ...state, spentUsd: spent };
      const hit = ceilingHit(s, cfg, now);
      // A ceiling reached mid-loop still lets the CURRENT work be reviewed —
      // stopping without a verdict leaves the user with an unassessed diff.
      if (hit === "budget" || hit === "wall_clock") return done(s, hit);
      return { state: { ...s, phase: "reviewing" }, effects: [{ type: "startReview", round: s.round }] };
    }

    case "reviewFinished": {
      const spent = state.spentUsd + action.costUsd;
      if (!action.ok) return done({ ...state, spentUsd: spent }, "review_failed");

      if (!citationsResolve(action.findings, ruleExists)) {
        return done({ ...state, spentUsd: spent }, "invalid_findings");
      }

      const history = [...state.history, ...action.findings];
      const open = blocking(action.findings, cfg);
      const s = { ...state, spentUsd: spent, history, open };

      if (open.length === 0) return done(s, "converged");

      const hit = ceilingHit(s, cfg, now);
      if (hit) return done(s, hit);

      const next = { ...s, round: s.round + 1, phase: "fixing" as LoopPhase };
      return { state: next, effects: [{ type: "startFix", round: next.round, findings: open }] };
    }
  }
}

/** One line for the user. The whole point of tracking the binding constraint. */
export function describeTermination(state: LoopState, cfg: LoopConfig): string {
  const open = state.open.length;
  switch (state.binding) {
    case "converged":
      return `Converged at round ${state.round} of ${cfg.maxRounds}.`;
    case "max_rounds":
      return `Stopped at the round ceiling (${state.round}/${cfg.maxRounds}) with ${open} blocking finding${open === 1 ? "" : "s"} open.`;
    case "budget":
      return `Stopped on budget ($${state.spentUsd.toFixed(2)} of $${(cfg.budgetUsd ?? 0).toFixed(2)}) at round ${state.round}.`;
    case "wall_clock":
      return `Stopped on the time limit at round ${state.round}.`;
    case "review_failed":
      return `Stopped — the review did not complete at round ${state.round}.`;
    case "fix_failed":
      return `Stopped — the fix run failed at round ${state.round}.`;
    case "user_stopped":
      return `Stopped by you at round ${state.round}.`;
    case "author_failed":
      return `Stopped — the authoring run failed at round ${state.round}.`;
    case "invalid_findings":
      return `Stopped — the reviewer returned findings citing rules that do not exist. Treated as a miswired reviewer, not a pass.`;
    case "dispatch_failed":
      return `Stopped — round ${state.round} could not be started. The work so far is intact; re-run to continue.`;
    case "corrupt_state":
      return `Stopped — this loop's stored state could not be read. Start a new loop; nothing was left running.`;
    default:
      return `Running — round ${state.round} of ${cfg.maxRounds}.`;
  }
}
