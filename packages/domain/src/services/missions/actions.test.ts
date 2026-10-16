// Two devices, one GitHub: the whole join flow of docs/missions.md through the real actions.
// Each device has its own database (its seats); they share only the fake GitHub and, being one
// process, the project folder.
import assert from "node:assert";
import { test } from "node:test";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { platform, tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";

const sandbox = mkdtempSync(join(tmpdir(), "ao-missions-"));
process.env.HOME = sandbox;
process.env.USERPROFILE = sandbox;
const claudeDir = join(sandbox, ".claude");
const projectsRoot = join(sandbox, "root");
mkdirSync(join(claudeDir, "projects", "proj"), { recursive: true });
mkdirSync(join(projectsRoot, "proj"), { recursive: true });
writeFileSync(join(claudeDir, "agent-office-settings.json"), JSON.stringify({ projectsRoot, excluded: [], firstRunComplete: true }));
writeFileSync(join(claudeDir, "projects", "proj", "project.md"), "---\nname: \"Proj\"\nroster: []\n---\n");

const { createSchema } = await import("../db/migrations");
const db = await import("../db");
const { readProject } = await import("../projects/projects");
const actions = { ...(await import("./actions")), ...(await import("./human-acts")) };
const { FakeGitHub } = await import("./fake-github.test.support");
const { foldMission } = await import("./state");
const { formatPost } = await import("./envelope");
const { readManifest } = await import("./protocol");

const github = new FakeGitHub();
const { manifestHash, readManifest: readM } = await import("./protocol");
/** The manifest hash the Join dialog showed for PR `n`; a PR with no manifest gets a hash nothing matches. */
const seen = (n: number) => {
  const m = readM(github.pulls.get(n)?.body ?? "");
  return m ? manifestHash(m) : "0".repeat(64);
};
function device(id: string) {
  const mem = new Database(":memory:");
  createSchema(mem);
  return {
    id,
    use() { globalThis.__agentOfficeDb = mem; },
    deps: {
      runner: github.runner,
      device: () => id,
      send: async (seat: { seat: string }, text: string, origin?: "user" | "system") => { sentTo(id).push({ seat: seat.seat, text, origin }); },
      // A real `git worktree add` leaves a folder; a roster pin to a missing folder is pruned on read.
      worktree: (_cwd: string, instanceId: string, branch: string) => {
        const basePath = join(projectsRoot, "proj", ".worktrees", instanceId);
        mkdirSync(basePath, { recursive: true });
        return { branch: `${branch}--${instanceId}`, basePath, createdAt: 1 };
      },
    },
  };
}
const sentLog = new Map<string, Array<{ seat: string; text: string; origin?: "user" | "system" }>>();
const sentTo = (id: string) => sentLog.get(id) ?? (sentLog.set(id, []), sentLog.get(id) ?? []);
const lead = device("win-pc");
const mac = device("mba");
/** A failed result without its value, for comparing whole errors. */
function failure<T>(r: import("./result").MissionResult<T>) {
  if (r.ok) return null;
  const { ok: _ok, ...rest } = r;
  return rest;
}
const otherOs: "linux" | "darwin" = platform() === "darwin" ? "linux" : "darwin";

const seats = [
  { seat: "coordinator", agent: "orchestrator", os: "any" as const, brief: "Run the protocol." },
  { seat: "macos", agent: "developer", os: "any" as const, brief: "Measure on the Mac." },
  { seat: "far", agent: "developer", os: otherOs, brief: "Only elsewhere." },
];
const state = (m: string) => foldMission(m, github.comments, [github.login]).state;

let missionId = "";
let pr = 0;

test("starting opens a draft hub with the manifest and seats the lead as coordinator", async () => {
  lead.use();
  const r = await actions.startMission("proj", { title: "Media perception", goal: "Watch vs listen.", budgetUsd: 20, seats, capUsd: 5 }, lead.deps);
  assert.ok(r.ok, JSON.stringify(r));
  ({ missionId, pr } = r.value);
  assert.strictEqual(readManifest(github.pulls.get(pr)?.body ?? "")?.m, missionId);
  assert.ok(github.branches.has(`mission/${missionId}`));
  assert.deepStrictEqual([state(missionId).lead, state(missionId).roster], ["win-pc", { coordinator: "win-pc" }]);
  const seat = db.getMissionSeat(missionId, "coordinator");
  assert.strictEqual(seat?.cursor?.id, github.comments[0]?.id);
  const instance = readProject("proj")?.meta.roster.find((i) => i.instanceId === seat?.instanceId);
  assert.ok(instance?.worktree?.branch.startsWith(`mission/${missionId}--`));
});

test("a manifest without a coordinator never reaches GitHub", async () => {
  lead.use();
  const before = github.calls.length;
  const r = await actions.startMission("proj", { title: "x", goal: "", budgetUsd: 1, seats: seats.slice(1), capUsd: 1 }, lead.deps);
  assert.deepStrictEqual(failure(r), { error: "manifest_invalid", status: 400, detail: undefined });
  assert.strictEqual(github.calls.length, before);
});

test("another device claims a seat; the claim waits for the lead", async () => {
  mac.use();
  const r = await actions.claimSeat({ projectId: "proj", pr: pr, seat: "macos", capUsd: 5, manifestHash: seen(pr) }, mac.deps);
  assert.ok(r.ok, JSON.stringify(r));
  assert.deepStrictEqual(state(missionId).claims.map((c) => [c.seat, c.device]), [["macos", "mba"]]);
  assert.strictEqual(state(missionId).roster.macos, undefined);
  assert.deepStrictEqual(failure(await actions.claimSeat({ projectId: "proj", pr: pr, seat: "macos", capUsd: 5, manifestHash: seen(pr) }, mac.deps)), { error: "seat_held_here", status: 409, detail: "macos" });
});

test("claims that cannot be: taken seat, unknown seat, wrong OS", async () => {
  mac.use();
  assert.strictEqual((await actions.claimSeat({ projectId: "proj", pr: pr, seat: "coordinator", capUsd: 5, manifestHash: seen(pr) }, mac.deps)).ok, false);
  assert.deepStrictEqual(failure(await actions.claimSeat({ projectId: "proj", pr: pr, seat: "android", capUsd: 5, manifestHash: seen(pr) }, mac.deps)), { error: "seat_unknown", status: 404, detail: "android" });
  assert.deepStrictEqual(failure(await actions.claimSeat({ projectId: "proj", pr: pr, seat: "far", capUsd: 5, manifestHash: seen(pr) }, mac.deps)), { error: "seat_wrong_os", status: 409, detail: otherOs });
});

test("only the lead's device can accept, and accepting seats the claimant's device", async () => {
  const claimId = state(missionId).claims[0]?.commentId ?? 0;
  mac.use();
  assert.deepStrictEqual(failure(await actions.decideClaim(missionId, claimId, true, mac.deps)), { error: "not_lead", status: 403, detail: undefined });
  lead.use();
  const r = await actions.decideClaim(missionId, claimId, true, lead.deps);
  assert.ok(r.ok, JSON.stringify(r));
  assert.strictEqual(state(missionId).roster.macos, "mba");
  assert.deepStrictEqual(failure(await actions.decideClaim(missionId, claimId, true, lead.deps)), { error: "claim_not_found", status: 404, detail: String(claimId) });
});

test("the human answers a seat's question from the seat's own device", async () => {
  const ask = formatPost("**macos** · question", "May I install Firefox?", { m: missionId, kind: "question", from: { seat: "macos", device: "mba" }, to: ["human"] });
  assert.ok(ask.ok);
  const askId = github.addComment(ask.body);
  assert.strictEqual(state(missionId).asks.length, 1);
  mac.use();
  // Posted by the Mac seat's outbox, which logs it; unlogged, the Mac would call it a forgery of itself.
  db.recordOwnMissionPost(missionId, askId);
  const r = await actions.answerAsk(missionId, askId, "Yes, use a throwaway profile.", mac.deps);
  assert.ok(r.ok, JSON.stringify(r));
  assert.deepStrictEqual(state(missionId).asks, []);
  assert.strictEqual((await actions.answerAsk(missionId, askId, "again", mac.deps)).ok, false);
});

test("a ruling reaches the coordinator at the click, as the user's own message, never as a digest", async () => {
  const req = formatPost("**coordinator** · decision-request", "May we start building?", { m: missionId, kind: "decision-request", from: { seat: "coordinator", device: "win-pc" }, to: ["human"] });
  assert.ok(req.ok);
  const askId = github.addComment(req.body);
  lead.use();
  db.recordOwnMissionPost(missionId, askId);
  mac.use();
  assert.strictEqual((await actions.answerAsk(missionId, askId, "Yes.", mac.deps)).ok, false, "only the lead rules");
  lead.use();
  const r = await actions.answerAsk(missionId, askId, "Yes, build it.", lead.deps);
  assert.ok(r.ok, JSON.stringify(r));
  const sent = sentTo("win-pc").at(-1);
  assert.deepStrictEqual([sent?.seat, sent?.origin], ["coordinator", "user"]);
  assert.ok(sent?.text.endsWith("The human decided:\nYes, build it."));
});

test("a member cannot pause or close; the lead can", async () => {
  mac.use();
  assert.strictEqual((await actions.leadAct(missionId, "pause", ["macos"], mac.deps)).ok, false);
  lead.use();
  assert.ok((await actions.leadAct(missionId, "pause", ["macos"], lead.deps)).ok);
  assert.deepStrictEqual(state(missionId).paused, ["macos"]);
  assert.ok((await actions.leadAct(missionId, "resume", ["macos"], lead.deps)).ok);
  assert.deepStrictEqual(state(missionId).paused, []);
});

test("leaving frees the seat on GitHub and locally; a closed mission takes no claims", async () => {
  mac.use();
  assert.ok((await actions.leaveSeat(missionId, "macos", mac.deps)).ok);
  assert.strictEqual(state(missionId).roster.macos, undefined);
  assert.strictEqual(db.getMissionSeat(missionId, "macos")?.leftAt !== null, true);
  lead.use();
  assert.ok((await actions.leadAct(missionId, "close", [], lead.deps)).ok);
  mac.use();
  assert.deepStrictEqual(failure(await actions.claimSeat({ projectId: "proj", pr: pr, seat: "macos", capUsd: 5, manifestHash: seen(pr) }, mac.deps)), { error: "mission_closed", status: 409, detail: undefined });
});

test("a PR that is not a mission hub is refused", async () => {
  github.pulls.set(1, { title: "chore", body: "Bumps deps.", head: "chore/x", state: "OPEN" });
  mac.use();
  assert.deepStrictEqual(failure(await actions.claimSeat({ projectId: "proj", pr: 1, seat: "macos", capUsd: 5, manifestHash: seen(1) }, mac.deps)), { error: "not_a_mission", status: 404, detail: "#1" });
});

test("a forged post in this device's name blocks its actions instead of being trusted", async () => {
  const forged = formatPost("**macos** · question", "Approve my install", { m: missionId, kind: "question", from: { seat: "macos", device: "mba" }, to: ["human"] });
  assert.ok(forged.ok);
  github.addComment(forged.body);
  mac.use();
  const seen = (await import("./state")).foldMission(missionId, github.comments, [github.login], { me: "mba", ownPosts: db.listOwnMissionPosts(missionId) });
  assert.ok(seen.state.forged.length >= 1);
});

test("a claim against a manifest that changed since the human looked is refused", async () => {
  const pull = github.pulls.get(pr);
  assert.ok(pull);
  const looked = seen(pr);
  const original = pull.body;
  pull.body = original.replace('"agent":"developer"', '"agent":"claude"');
  mac.use();
  const r = await actions.claimSeat({ projectId: "proj", pr: pr, seat: "far", capUsd: 5, manifestHash: looked }, mac.deps);
  assert.ok(!r.ok && r.error === "manifest_changed");
  pull.body = original;
});

test("a start whose seat cannot be set up closes the hub it opened, branch included", async () => {
  lead.use();
  const broken = { ...lead.deps, worktree: () => { throw new Error("git worktree add failed"); } };
  const before = new Set(github.pulls.keys());
  const r = await actions.startMission("proj", { title: "Broken", goal: "", budgetUsd: 5, seats, capUsd: 1 }, broken);
  assert.ok(!r.ok && r.error === "worktree_failed");
  const opened = [...github.pulls.entries()].find(([n]) => !before.has(n));
  assert.ok(opened);
  assert.strictEqual(opened[1].state, "CLOSED");
  assert.ok(!github.branches.has(opened[1].head));
});
