// Which seats on THIS device a hub comment is for (docs/missions.md, "Trust"). Whether a comment
// counts at all is the fold's verdict (state.ts), judged against the state just before it; routing
// never re-decides it, so the two cannot disagree.
import { COORDINATOR_SEAT, TO_ALL, TO_HUMAN, isControlPostKind } from "../../config/missions";
import type { Envelope } from "./envelope";
import type { IgnoreReason as FoldIgnore, Verdict } from "./state";

export interface RouteContext {
  /** Accepted seats this device holds. */
  held: readonly string[];
  me: string;
}

export type IgnoreReason = FoldIgnore | "not_addressed_here" | "local_only";

export type Route =
  /** Agent turns for `seats` on this device; `forHuman` adds a needs-you item here. */
  | { action: "deliver"; seats: string[]; forHuman: boolean; envelope: Envelope; text: string }
  /** A plain comment by the user: input for the coordinator, with no power to approve (D6). */
  | { action: "human-input"; text: string }
  /** The human's answer to a seat. `verified`: clicked on this very device; otherwise any agent
   *  with shell access on the posting device could have written it. */
  | { action: "human-words"; seats: string[]; envelope: Envelope; text: string; verified: boolean }
  /** Bookkeeping (claim, accept, pause, …) the fold applied. Never shown to an agent as an instruction. */
  | { action: "control"; envelope: Envelope; text: string }
  | { action: "ignore"; reason: IgnoreReason };

const ignore = (reason: IgnoreReason): Route => ({ action: "ignore", reason });

export function routeComment(verdict: Verdict, ctx: RouteContext): Route {
  if (!verdict.applied) return ignore(verdict.reason);
  const leadHere = ctx.held.includes(COORDINATOR_SEAT);
  const e = verdict.envelope;
  if (!e) return leadHere ? { action: "human-input", text: verdict.text } : ignore("not_addressed_here");
  // A ruling approves gates (D4). It reaches the coordinator from the click on the lead device,
  // never from GitHub, where any agent could have posted it as the lead.
  if (e.kind === "decision") return ignore("local_only");
  if (e.kind === "reply") {
    const seats = ctx.held.filter((s) => e.to.includes(s));
    return seats.length ? { action: "human-words", seats, envelope: e, text: verdict.text, verified: e.from.device === ctx.me } : ignore("not_addressed_here");
  }
  if (isControlPostKind(e.kind)) return { action: "control", envelope: e, text: verdict.text };
  const seats = ctx.held.filter((s) => s !== e.from.seat && (e.to.includes(TO_ALL) || e.to.includes(s)));
  const forHuman = leadHere && e.to.includes(TO_HUMAN);
  if (seats.length === 0 && !forHuman) return ignore("not_addressed_here");
  return { action: "deliver", seats, forHuman, envelope: e, text: verdict.text };
}
