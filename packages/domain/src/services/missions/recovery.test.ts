// The ways a mission action can half-fail, and what is left behind: a public repo, a claim GitHub
// refused, a seat whose device is gone, a ruling that could not be delivered, a post whose answer
// timed out, and posts the hub could not take.
import assert from "node:assert";
import { test } from "node:test";
import { db, device as makeDevice, github, seen } from "./mission-devices.test.support";

const actions = { ...(await import("./actions")), ...(await import("./human-acts")) };
const { readProject } = await import("../projects/projects");
const { ghFor } = await import("../review/pulls");
const { postEnvelope } = await import("./hub");
const { foldMission } = await import("./state");
const { formatPost } = await import("./envelope");
const { postSeatOutbox } = await import("./posting");
const { missionView } = await import("./views");
const { withSeatBudget } = await import("../execution/summon-run");

let missionId = "";
let pr = 0;
const device = (id: string) => makeDevice(id, () => missionId);
const lead = device("win-pc");
const mac = device("mba");
const state = () => foldMission(missionId, github.comments, [github.login]).state;
const seats = [
  { seat: "coordinator", agent: "orchestrator", os: "any" as const, brief: "Run the protocol." },
  { seat: "macos", agent: "developer", os: "any" as const, brief: "Measure on the Mac." },
];
const start = { title: "Recovery", goal: "", budgetUsd: 5, seats, capUsd: 1 };

test("a public repo needs the human's explicit yes before anything is posted", async () => {
  lead.use();
  github.visibility = "PUBLIC";
  try {
    const before = github.pulls.size;
    const r = await actions.startMission("proj", start, lead.deps);
    assert.ok(!r.ok && r.error === "repo_public" && r.status === 409, JSON.stringify(r));
    assert.strictEqual(github.pulls.size, before);
    const yes = await actions.startMission("proj", { ...start, allowPublic: true }, lead.deps);
    assert.ok(yes.ok, JSON.stringify(yes));
    ({ missionId, pr } = yes.value);
    mac.use();
    const claim = await actions.claimSeat({ projectId: "proj", pr, seat: "macos", capUsd: 5, manifestHash: seen(pr) }, mac.deps);
    assert.ok(!claim.ok && claim.error === "repo_public", "a claim asks again");
  } finally {
    github.visibility = "PRIVATE";
  }
});

test("a claim GitHub refuses leaves no seat and no chat behind on the claiming device", async () => {
  mac.use();
  const roster = () => readProject("proj")?.meta.roster.map((i) => i.instanceId);
  const before = roster();
  github.failPosts = 1;
  const claim = { projectId: "proj", pr, seat: "macos", capUsd: 5, manifestHash: seen(pr) };
  assert.strictEqual((await actions.claimSeat(claim, mac.deps)).ok, false);
  assert.deepStrictEqual(roster(), before);
  assert.strictEqual(db.getMissionSeat(missionId, "macos"), null);
  const retry = await actions.claimSeat(claim, mac.deps);
  assert.ok(retry.ok, JSON.stringify(retry));
});

test("posts the hub could not take are named in the seat's next delivery, not a turn of their own", async () => {
  lead.use();
  assert.ok((await actions.decideClaim(missionId, state().claims[0]?.commentId ?? 0, true, lead.deps)).ok);
  await lead.poll();
  await mac.poll();
  lead.take();
  mac.take();
  github.failLists = 1;
  await mac.say("macos", "```ao-post\nto: coordinator\nkind: result\n---\nT6 done.\n```");
  assert.deepStrictEqual(mac.take(), [], "no turn is started just to say so");
  await mac.poll();
  const [alone] = mac.take();
  assert.ok(alone?.text.startsWith("Agent Office posted 0 of your ao-post blocks"), "delivered with no other traffic");
  assert.ok(alone?.text.includes("outbox_hub_unreachable"));

  const s = mac.seat("macos");
  await postSeatOutbox({ instanceId: s.instanceId, parentRunId: undefined, cost: 0.1, output: "```ao-post\nto: coordinator\nkind: result\n---\nT8.\n```", status: "error" }, mac.deps);
  await lead.say("coordinator", "```ao-post\nto: macos\nkind: work-order\n---\nT9.\n```");
  await mac.poll();
  const [next] = mac.take();
  assert.ok(next?.text.includes("outbox_turn_stopped"), "a cut-off turn's posts are named");
  assert.ok(next?.text.includes("T9."));
});

test("a deleted comment under a seat's cursor does not freeze the seat", async () => {
  const cursor = mac.seat("macos").cursor?.id;
  const at = github.comments.findIndex((c) => c.id === cursor);
  assert.ok(at >= 0);
  github.comments.splice(at, 1);
  await lead.say("coordinator", "```ao-post\nto: macos\nkind: work-order\n---\nT10.\n```");
  await mac.poll();
  assert.ok(mac.take()[0]?.text.includes("T10."));
});

test("a seat turn is bounded to what is left of its cap, and refused below the minimum", async () => {
  mac.use();
  const s = mac.seat("macos");
  const req = { agentId: s.agentId, prompt: "go", instanceId: s.instanceId };
  const bounded = withSeatBudget(req, s.instanceId);
  assert.ok(!("status" in bounded));
  assert.strictEqual(bounded.maxBudgetUsd, s.capUsd - s.spentUsd);
  db.addMissionSpend(missionId, "macos", s.capUsd);
  const refusedTurn = withSeatBudget(req, s.instanceId);
  assert.ok("status" in refusedTurn && refusedTurn.code === "seat_cap_reached");
  db.raiseMissionCap(missionId, "macos", s.capUsd * 2);
  const other = { agentId: "x", prompt: "go" };
  assert.strictEqual(withSeatBudget(other, "developer-not-a-seat"), other, "not a seat: untouched");
});

test("a ruling delivered but not recorded on the hub cannot be given twice", async () => {
  const req = formatPost("**coordinator** · decision-request", "Merge?", { m: missionId, kind: "decision-request", from: { seat: "coordinator", device: "win-pc" }, to: ["human"] });
  assert.ok(req.ok);
  const askId = github.addComment(req.body);
  lead.use();
  db.recordOwnMissionPost(missionId, askId);
  github.failPosts = 1;
  assert.ok((await actions.answerAsk(missionId, askId, "Yes.", lead.deps)).ok, "the coordinator has it");
  const view = await missionView(missionId, lead.deps);
  assert.ok(view.ok && !view.value.asks.some((a) => a.commentId === askId), "hidden here though open on the hub");
  const again = await actions.answerAsk(missionId, askId, "No.", lead.deps);
  assert.ok(!again.ok && again.error === "ask_not_found");
});

test("a ruling for a coordinator at its cap is refused before anything is sent or posted", async () => {
  const req = formatPost("**coordinator** · decision-request", "Rebase?", { m: missionId, kind: "decision-request", from: { seat: "coordinator", device: "win-pc" }, to: ["human"] });
  assert.ok(req.ok);
  const askId = github.addComment(req.body);
  lead.use();
  db.recordOwnMissionPost(missionId, askId);
  const lead0 = lead.seat("coordinator");
  db.addMissionSpend(missionId, "coordinator", lead0.capUsd);
  const before = github.comments.length;
  const r = await actions.answerAsk(missionId, askId, "Yes.", lead.deps);
  assert.ok(!r.ok && r.error === "seat_out_of_budget", JSON.stringify(r));
  assert.strictEqual(github.comments.length, before);
  db.raiseMissionCap(missionId, "coordinator", lead0.capUsd * 2);
});

test("a stranger's comment carrying our nonce is not taken for our lost post", async () => {
  const project = readProject("proj");
  assert.ok(project);
  lead.use();
  const gh = ghFor(project, async (call) => {
    if (call.args.includes("POST") && call.args.some((a) => a.endsWith("/comments"))) {
      github.addComment(JSON.parse(call.input ?? "{}").body, "mallory");
      throw new Error("timed out after 60s");
    }
    return github.runner(call);
  });
  await assert.rejects(postEnvelope(gh, pr, "**🛰 mission** · pause", "Paused.", { m: missionId, kind: "pause", from: { seat: "human", device: "win-pc" }, to: ["macos"] }));
});

test("a ruling whose delivery fails stays open instead of vanishing from the hub", async () => {
  const req = formatPost("**coordinator** · decision-request", "Ship it?", { m: missionId, kind: "decision-request", from: { seat: "coordinator", device: "win-pc" }, to: ["human"] });
  assert.ok(req.ok);
  const askId = github.addComment(req.body);
  lead.use();
  db.recordOwnMissionPost(missionId, askId);
  const failing = { ...lead.deps, send: async () => { throw new Error("chat gone"); } };
  await assert.rejects(actions.answerAsk(missionId, askId, "Yes.", failing));
  assert.ok(state().asks.some((a) => a.commentId === askId));
});

test("a post GitHub stored before timing out is not reported as failed, nor posted twice", async () => {
  const project = readProject("proj");
  assert.ok(project);
  lead.use();
  const before = github.comments.length;
  const gh = ghFor(project, async (call) => {
    const out = await github.runner(call);
    if (call.args.includes("POST") && call.args.some((a) => a.endsWith("/comments"))) throw new Error("timed out after 60s");
    return out;
  });
  const r = await postEnvelope(gh, pr, "**🛰 mission** · pause", "Paused.", { m: missionId, kind: "pause", from: { seat: "human", device: "win-pc" }, to: ["macos"] });
  assert.ok(r.ok);
  assert.strictEqual(github.comments.length, before + 1);
  assert.strictEqual(r.cursor.id, github.comments.at(-1)?.id);
});

test("the lead evicts a seat whose device is gone, so it can be claimed again", async () => {
  mac.use();
  assert.strictEqual((await actions.leadAct(missionId, "evict", ["macos"], mac.deps)).ok, false, "only the lead evicts");
  lead.use();
  const coordinator = await actions.leadAct(missionId, "evict", ["coordinator"], lead.deps);
  assert.ok(!coordinator.ok && coordinator.error === "seat_unknown");
  assert.ok((await actions.leadAct(missionId, "evict", ["macos"], lead.deps)).ok);
  assert.strictEqual(state().roster.macos, undefined);
  await mac.poll();
  assert.notStrictEqual(mac.seat("macos").leftAt, null);
});
