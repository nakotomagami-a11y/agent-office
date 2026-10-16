import assert from "node:assert";
import { test } from "node:test";
import { formatPost, type Envelope } from "./envelope";
import { routeComment, type Route } from "./routing";
import { foldMission, type HubComment } from "./state";

const M = "k3f9q2";
const ME = "chaosandcurves";
let nextId = 100;

function post(env: Partial<Envelope> & { kind: Envelope["kind"] }, text = "body", author = ME): HubComment {
  const made = formatPost("header", text, { m: M, from: { seat: "human", device: "win-pc" }, to: ["coordinator"], ...env });
  assert.ok(made.ok);
  return { id: nextId++, author, body: made.body };
}
const human = (device: string) => ({ from: { seat: "human" as const, device } });

/** win-pc leads and also sits windows; mba sits macos; cachy sits linux. Built first, so every
 *  post a test adds has a higher id and is judged after the seating, as on GitHub. */
const SEATED: HubComment[] = [
    post({ kind: "accept", to: ["coordinator"], data: { device: "win-pc" } }),
    post({ kind: "claim", from: { seat: "windows", device: "win-pc" } }),
    post({ kind: "accept", to: ["windows"], data: { device: "win-pc" } }),
    post({ kind: "claim", from: { seat: "macos", device: "mba" } }),
    post({ kind: "accept", to: ["macos"], data: { device: "mba" } }),
    post({ kind: "claim", from: { seat: "linux", device: "cachy" } }),
    post({ kind: "accept", to: ["linux"], data: { device: "cachy" } }),
];

/** Fold the thread, then route its last comment the way the poller does on `me`. */
function routeLast(extra: HubComment[], held: string[], me: string): Route {
  const thread = [...SEATED, ...extra];
  const { verdicts } = foldMission(M, thread, [ME]);
  const last = thread.at(-1);
  assert.ok(last);
  const verdict = verdicts.get(last.id);
  assert.ok(verdict);
  return routeComment(verdict, { held, me });
}
const LEAD = ["coordinator", "windows"];

test("a post addressed to a seat this device holds becomes a turn for it", () => {
  const r = routeLast([post({ kind: "result", from: { seat: "linux", device: "cachy" }, to: ["coordinator", "macos"] })], LEAD, "win-pc");
  assert.ok(r.action === "deliver");
  assert.deepStrictEqual([r.seats, r.forHuman, r.text], [["coordinator"], false, "header\n\nbody"]);
});

test("all reaches every seat here except the sender's own", () => {
  const r = routeLast([post({ kind: "result", from: { seat: "windows", device: "win-pc" }, to: ["all"] })], LEAD, "win-pc");
  assert.ok(r.action === "deliver");
  assert.deepStrictEqual(r.seats, ["coordinator"]);
});

test("a question for the human surfaces only where the coordinator sits", () => {
  const ask = post({ kind: "question", from: { seat: "macos", device: "mba" }, to: ["human"] });
  const atLead = routeLast([ask], LEAD, "win-pc");
  assert.ok(atLead.action === "deliver");
  assert.deepStrictEqual([atLead.seats, atLead.forHuman], [[], true]);
  assert.deepStrictEqual(routeLast([ask], ["linux"], "cachy"), { action: "ignore", reason: "not_addressed_here" });
});

test("whatever the fold refuses, routing refuses with the fold's reason", () => {
  const cases: Array<[HubComment, string]> = [
    [post({ kind: "result", from: { seat: "linux", device: "someone-elses-laptop" }, to: ["all"] }), "not_on_roster"],
    [post({ kind: "work-order", from: { seat: "linux", device: "cachy" }, to: ["all"] }), "coordinator_only"],
    [post({ kind: "pause", ...human("mba"), to: ["linux"] }), "not_from_lead"],
    [post({ kind: "accept", ...human("mba"), to: ["android"], data: { device: "evil" } }), "not_from_lead"],
    [post({ kind: "result", from: { seat: "linux", device: "cachy" } }, "x", "stranger"), "untrusted_author"],
    [post({ kind: "result", m: "zzzz99", from: { seat: "linux", device: "cachy" } }), "other_mission"],
  ];
  for (const [c, reason] of cases) assert.deepStrictEqual(routeLast([c], ["macos"], "mba"), { action: "ignore", reason }, reason);
});

test("routing never lets through what the fold did not apply — checked across a whole thread", () => {
  const thread = [
    ...SEATED,
    post({ kind: "result", from: { seat: "macos", device: "mba" }, to: ["all"] }),
    post({ kind: "claim", from: { seat: "windows", device: "evil" } }),
    post({ kind: "leave", to: ["coordinator"] }),
    post({ kind: "status", ...human("win-pc"), to: ["macos"] }),
    post({ kind: "decision", from: { seat: "coordinator", device: "win-pc" }, to: ["coordinator"] }),
    post({ kind: "reply", re: 1, ...human("evil"), to: ["macos"] }),
    { id: nextId++, author: ME, body: "plain words" },
  ];
  const { verdicts } = foldMission(M, thread, [ME]);
  for (const c of thread) {
    const v = verdicts.get(c.id);
    assert.ok(v);
    for (const [held, me] of [[LEAD, "win-pc"], [["macos"], "mba"], [["linux"], "cachy"]] as const) {
      const r = routeComment(v, { held, me });
      if (r.action !== "ignore") assert.ok(v.applied, `comment ${c.id} routed (${r.action}) though the fold refused it`);
    }
  }
});

test("a ruling never reaches the coordinator from GitHub: it is delivered at the click", () => {
  const ruling = post({ kind: "decision", ...human("win-pc"), to: ["coordinator"], re: 1 });
  assert.deepStrictEqual(routeLast([ruling], LEAD, "win-pc"), { action: "ignore", reason: "local_only" });
});

test("the human's reply reaches the seat it names; only one clicked on this device is verified", () => {
  const fromHere = routeLast([post({ kind: "reply", ...human("mba"), to: ["macos"], re: 5 }, "Yes.")], ["macos"], "mba");
  assert.ok(fromHere.action === "human-words");
  assert.deepStrictEqual([fromHere.seats, fromHere.verified], [["macos"], true]);
  const fromLead = routeLast([post({ kind: "reply", ...human("win-pc"), to: ["macos"], re: 5 })], ["macos"], "mba");
  assert.ok(fromLead.action === "human-words" && !fromLead.verified);
});

test("bookkeeping the fold applied is control, never a turn", () => {
  assert.strictEqual(routeLast([post({ kind: "pause", ...human("win-pc"), to: ["macos"] })], ["macos"], "mba").action, "control");
  assert.strictEqual(routeLast([post({ kind: "claim", from: { seat: "qa", device: "pixel" } })], LEAD, "win-pc").action, "control");
});

test("a plain comment is the user's input — for the coordinator only", () => {
  const plain = { id: nextId++, author: ME, body: "Skip Firefox for now.\n" };
  assert.deepStrictEqual(routeLast([plain], LEAD, "win-pc"), { action: "human-input", text: "Skip Firefox for now." });
  assert.deepStrictEqual(routeLast([plain], ["macos"], "mba"), { action: "ignore", reason: "not_addressed_here" });
});

test("a seat's own post addressed only to itself routes nowhere", () => {
  const r = routeLast([post({ kind: "result", from: { seat: "macos", device: "mba" }, to: ["macos"] })], ["macos"], "mba");
  assert.deepStrictEqual(r, { action: "ignore", reason: "not_addressed_here" });
});
