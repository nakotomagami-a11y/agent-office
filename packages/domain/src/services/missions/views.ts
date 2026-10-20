// What the UI shows about a mission: always folded fresh from the hub (docs/missions.md, D1), plus
// this device's own seats. Read-only; every change goes through actions.ts.
import { platform } from "node:os";
import { COORDINATOR_SEAT } from "../../config/missions";
import type { HubView, MissionView } from "../../types/index";
import * as db from "../db";
import { readProject } from "../projects/projects";
import { ghFor } from "../review/pulls";
import { productionActionDeps, readHub, type ActionDeps } from "./actions";
import { ActionError, run } from "./result";
import { listHubs } from "./hub";
import { manifestHash, readManifest } from "./protocol";

export function missionView(missionId: string, deps: ActionDeps = productionActionDeps) {
  return run(async (): Promise<MissionView> => {
    const local = db.listActiveMissionSeats().filter((s) => s.missionId === missionId);
    const first = local[0];
    if (!first) throw new ActionError("not_seated", missionId);
    const h = await readHub(first.projectId, first.prNumber, deps);
    const s = h.state;
    const leadHere = s.lead === h.me && Object.hasOwn(s.roster, COORDINATOR_SEAT);
    const alarm = s.forged.length ? "forged" : local.some((l) => l.leadDevice !== s.lead) ? "lead_changed" : null;
    return {
      missionId, title: h.manifest.title, goal: h.manifest.goal, projectId: first.projectId, pr: first.prNumber, url: h.url, branch: h.branch,
      lead: s.lead, leadHere, closed: s.closed, alarm, forged: s.forged, me: h.me,
      seats: h.manifest.seats.map((spec) => {
        const device = Object.hasOwn(s.roster, spec.seat) ? s.roster[spec.seat] ?? null : null;
        return {
          seat: spec.seat, agent: spec.agent, os: spec.os, brief: spec.brief, device, mine: device === h.me,
          paused: s.paused.includes(spec.seat), status: Object.hasOwn(s.status, spec.seat) ? s.status[spec.seat]?.text ?? null : null,
        };
      }),
      claims: leadHere ? s.claims : [],
      asks: s.asks.filter((a) => a.kind !== "decision-request" || leadHere),
      local: local.map((l) => ({
        seat: l.seat, agentId: l.agentId, instanceId: l.instanceId, capUsd: l.capUsd, spentUsd: l.spentUsd,
        accepted: Object.hasOwn(s.roster, l.seat) && s.roster[l.seat] === h.me,
      })),
    };
  });
}

/** Open mission hubs in a project, for the Join dialog. A PR that is labelled but carries no
 *  manifest is skipped: it is not a mission. */
export function joinableHubs(projectId: string, deps: ActionDeps = productionActionDeps) {
  return run(async (): Promise<HubView[]> => {
    const project = readProject(projectId);
    if (!project?.meta.cwd) throw new ActionError("project_not_found", projectId);
    const pulls = (await listHubs(ghFor(project, deps.runner))).filter((p) => readManifest(p.body) !== null);
    const views: HubView[] = [];
    for (const p of pulls) {
      const h = await readHub(projectId, p.number, deps);
      const held = new Set(db.listActiveMissionSeats().filter((s) => s.missionId === h.manifest.m).map((s) => s.seat));
      views.push({
        pr: p.number, title: h.manifest.title, goal: h.manifest.goal, url: p.url, missionId: h.manifest.m,
        manifestHash: manifestHash(h.manifest), closed: h.state.closed,
        seats: h.manifest.seats.map((spec) => ({
          seat: spec.seat, agent: spec.agent, os: spec.os, brief: spec.brief,
          taken: Object.hasOwn(h.state.roster, spec.seat), mine: held.has(spec.seat), fits: spec.os === "any" || spec.os === platform(),
        })),
      });
    }
    return views;
  });
}

/** Which mission seat a chat is, so the chat header can show the pill. Local only: no GitHub call. */
export function seatForInstance(instanceId: string): { missionId: string; seat: string } | null {
  const s = db.missionSeatForInstance(instanceId);
  return s ? { missionId: s.missionId, seat: s.seat } : null;
}
