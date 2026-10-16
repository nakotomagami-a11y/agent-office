// What the human's clicks on a mission's needs-you items do (docs/missions.md, D4/D6): accept or
// reject a claim, answer a seat, rule on a decision, pause, resume, close. Each is a local click
// on the device that acts; nothing on GitHub can do any of it.
import { COORDINATOR_SEAT, MIN_SEAT_TURN_USD } from "../../config/missions";
import type { MissionSeat } from "../../types/index";
import * as db from "../db";
import { log } from "../infra/log";
import { post, productionActionDeps, readHub, type ActionDeps, type Hub } from "./actions";
import type { Envelope } from "./envelope";
import { rulingMessage } from "./protocol";
import { ActionError, change } from "./result";

/** The lead's own hub: only the device holding the coordinator seat may act for the human. */
async function leadHub(missionId: string, deps: ActionDeps): Promise<{ h: Hub; lead: MissionSeat }> {
  const lead = db.getMissionSeat(missionId, COORDINATOR_SEAT);
  if (!lead || lead.leftAt !== null) throw new ActionError("not_lead");
  const h = await readHub(lead.projectId, lead.prNumber, deps);
  if (h.state.lead !== h.me || lead.leadDevice !== h.me) throw new ActionError("not_lead");
  return { h, lead };
}

export function decideClaim(missionId: string, claimId: number, accept: boolean, deps: ActionDeps = productionActionDeps) {
  return change(async () => {
    const { h } = await leadHub(missionId, deps);
    const claim = h.state.claims.find((c) => c.commentId === claimId);
    if (!claim) throw new ActionError("claim_not_found", String(claimId));
    if (accept && Object.hasOwn(h.state.roster, claim.seat)) throw new ActionError("seat_taken", claim.seat);
    await post(h, `**🛰 ${claim.seat}** ${accept ? "accepted" : "rejected"}`, accept ? `Seat \`${claim.seat}\` is held by device \`${claim.device}\`.` : "Claim rejected.",
      { kind: accept ? "accept" : "reject", from: { seat: "human", device: h.me }, to: [claim.seat], re: claimId, data: { device: claim.device } });
  });
}

/** The human answering a seat's question or task from any device holding a seat; or, on the lead
 *  device, ruling on a decision-request — delivered to the coordinator HERE, at the click, because
 *  a ruling on GitHub could have been posted by any agent (routing.ts `local_only`). */
/** Rulings delivered to the coordinator whose record never reached the hub: the ask is still open
 *  there, but answering it again would hand the coordinator a second ruling. In memory. */
const ruled = new Set<string>();
export const isRuledHere = (missionId: string, askId: number) => ruled.has(`${missionId}|${askId}`);

export function answerAsk(missionId: string, askId: number, text: string, deps: ActionDeps = productionActionDeps) {
  return change(async () => {
    const mine = db.listActiveMissionSeats().find((s) => s.missionId === missionId);
    if (!mine) throw new ActionError("not_seated");
    const h = await readHub(mine.projectId, mine.prNumber, deps);
    if (!Object.values(h.state.roster).includes(h.me)) throw new ActionError("not_seated");
    const ask = h.state.asks.find((a) => a.commentId === askId);
    if (!ask || isRuledHere(missionId, askId)) throw new ActionError("ask_not_found", String(askId));
    const ruling = ask.kind === "decision-request";
    const lead = db.getMissionSeat(missionId, COORDINATOR_SEAT);
    if (ruling && (h.state.lead !== h.me || !lead || lead.leftAt !== null)) throw new ActionError("not_lead");
    const env: Omit<Envelope, "m"> = { kind: ruling ? "decision" : "reply", from: { seat: "human", device: h.me }, to: [ask.seat], re: askId };
    // A coordinator at its cap would park the ruling in a stopped chat while the hub says it was given.
    if (ruling && lead && lead.capUsd - lead.spentUsd < MIN_SEAT_TURN_USD) throw new ActionError("seat_out_of_budget", COORDINATOR_SEAT);
    if (!ruling || !lead) {
      await post(h, `**🧑 the human** · reply`, text, env);
      return;
    }
    // Delivered first: once the decision is on the hub the ask is gone from every view, so a send
    // failing after it would lose the ruling. A record that fails to post only leaves the ask open.
    await deps.send(lead, rulingMessage(ask.text, text), "user");
    try {
      await post(h, `**🧑 the human** · decision`, text, env);
    } catch (err) {
      ruled.add(`${missionId}|${askId}`);
      log.warn("missions.ruling_unrecorded", { missionId, askId, err: err instanceof Error ? err.message : String(err) });
    }
  });
}

/** The lead frees seats whose device is gone, so another device can claim them (state.ts `leave`). */
async function evict(h: Hub, seats: string[]): Promise<void> {
  const targets = seats.filter((s) => s !== COORDINATOR_SEAT && Object.hasOwn(h.state.roster, s));
  if (targets.length === 0) throw new ActionError("seat_unknown", seats.join(","));
  for (const seat of targets) {
    await post(h, `**🛰 ${seat}** evicted`, `The lead freed seat \`${seat}\`; it can be claimed again.`,
      { kind: "leave", from: { seat: "human", device: h.me }, to: [seat] });
  }
}

export function leadAct(missionId: string, act: "pause" | "resume" | "close" | "evict", seats: string[], deps: ActionDeps = productionActionDeps) {
  return change(async () => {
    const { h } = await leadHub(missionId, deps);
    if (act === "evict") return evict(h, seats);
    const to = act === "close" ? [COORDINATOR_SEAT] : seats.filter((s) => Object.hasOwn(h.state.roster, s));
    if (to.length === 0) throw new ActionError("seat_unknown", seats.join(","));
    await post(h, `**🛰 mission** · ${act}`, act === "close" ? "The lead closed the mission." : `${act === "pause" ? "Paused" : "Resumed"}: ${to.join(", ")}.`,
      { kind: act, from: { seat: "human", device: h.me }, to });
  });
}
