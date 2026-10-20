// What the human's clicks on a mission's needs-you items do (docs/missions.md, D4/D6): accept or
// reject a claim, answer a seat, rule on a decision, pause, resume, close. Each is a local click
// on the device that acts; nothing on GitHub can do any of it.
import { COORDINATOR_SEAT } from "../../config/missions";
import type { MissionSeat } from "../../types/index";
import * as db from "../db";
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
export function answerAsk(missionId: string, askId: number, text: string, deps: ActionDeps = productionActionDeps) {
  return change(async () => {
    const mine = db.listActiveMissionSeats().find((s) => s.missionId === missionId);
    if (!mine) throw new ActionError("not_seated");
    const h = await readHub(mine.projectId, mine.prNumber, deps);
    if (!Object.values(h.state.roster).includes(h.me)) throw new ActionError("not_seated");
    const ask = h.state.asks.find((a) => a.commentId === askId);
    if (!ask) throw new ActionError("ask_not_found", String(askId));
    const ruling = ask.kind === "decision-request";
    const lead = db.getMissionSeat(missionId, COORDINATOR_SEAT);
    if (ruling && (h.state.lead !== h.me || !lead || lead.leftAt !== null)) throw new ActionError("not_lead");
    const env: Omit<Envelope, "m"> = { kind: ruling ? "decision" : "reply", from: { seat: "human", device: h.me }, to: [ask.seat], re: askId };
    await post(h, `**🧑 the human** · ${ruling ? "decision" : "reply"}`, text, env);
    if (ruling && lead) await deps.send(lead, rulingMessage(ask.text, text), "user");
  });
}

export function leadAct(missionId: string, act: "pause" | "resume" | "close", seats: string[], deps: ActionDeps = productionActionDeps) {
  return change(async () => {
    const { h } = await leadHub(missionId, deps);
    const to = act === "close" ? [COORDINATOR_SEAT] : seats.filter((s) => Object.hasOwn(h.state.roster, s));
    if (to.length === 0) throw new ActionError("seat_unknown", seats.join(","));
    await post(h, `**🛰 mission** · ${act}`, act === "close" ? "The lead closed the mission." : `${act === "pause" ? "Paused" : "Resumed"}: ${to.join(", ")}.`,
      { kind: act, from: { seat: "human", device: h.me }, to });
  });
}
