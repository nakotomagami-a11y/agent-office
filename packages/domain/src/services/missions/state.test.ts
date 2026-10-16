import assert from "node:assert";
import { test } from "node:test";
import { formatPost, type Envelope } from "./envelope";
import { foldMission as foldFull, type HubComment } from "./state";

const foldMission = (...args: Parameters<typeof foldFull>) => foldFull(...args).state;

const M = "k3f9q2";
const ME = "chaosandcurves";

function thread(...posts: Array<Partial<Envelope> & { kind: Envelope["kind"]; text?: string; author?: string }>): HubComment[] {
  return posts.map(({ text = "t", author = ME, ...p }, i) => {
    const made = formatPost("h", text, { m: M, from: { seat: "human", device: "win-pc" }, to: ["coordinator"], ...p });
    assert.ok(made.ok);
    return { id: 100 + i, author, body: made.body };
  });
}

const boot = { kind: "accept" as const, to: ["coordinator"], data: { device: "win-pc" } };
const claimMac = { kind: "claim" as const, from: { seat: "macos", device: "mba" } };
const acceptMac = { kind: "accept" as const, to: ["macos"], data: { device: "mba" } };

test("the creator's self-accept makes it the lead; a claim waits until the lead accepts it", () => {
  const before = foldMission(M, thread(boot, claimMac), [ME]);
  assert.deepStrictEqual([before.lead, before.roster, before.claims.map((c) => c.seat)], ["win-pc", { coordinator: "win-pc" }, ["macos"]]);
  const after = foldMission(M, thread(boot, claimMac, acceptMac), [ME]);
  assert.deepStrictEqual([after.roster, after.claims], [{ coordinator: "win-pc", macos: "mba" }, []]);
});

test("only the lead's clicks count: another device cannot accept, pause or close", () => {
  const rogue = { from: { seat: "human" as const, device: "mba" } };
  const s = foldMission(M, thread(boot, claimMac,
    { ...acceptMac, ...rogue },
    { kind: "pause", to: ["coordinator"], ...rogue },
    { kind: "close", ...rogue },
  ), [ME]);
  assert.deepStrictEqual([s.roster, s.paused, s.closed, s.claims.length], [{ coordinator: "win-pc" }, [], false, 1]);
});

test("nobody can bootstrap a lead after one exists, or with someone else's device", () => {
  const hijack = { kind: "accept" as const, to: ["coordinator"], from: { seat: "human" as const, device: "evil" }, data: { device: "evil" } };
  assert.strictEqual(foldMission(M, thread(boot, hijack), [ME]).lead, "win-pc");
  const forged = { ...boot, from: { seat: "human" as const, device: "evil" } };
  assert.strictEqual(foldMission(M, thread(forged), [ME]).lead, null);
});

test("one device per seat: a second accept for a held seat changes nothing", () => {
  const second = { kind: "accept" as const, to: ["macos"], data: { device: "other-mac" } };
  assert.strictEqual(foldMission(M, thread(boot, claimMac, acceptMac, second), [ME]).roster.macos, "mba");
});

test("a seat named after an Object.prototype key is a seat like any other", () => {
  const claim = { kind: "claim" as const, from: { seat: "constructor", device: "mba" } };
  const s = foldMission(M, thread(boot, claim, { kind: "accept", to: ["constructor"], data: { device: "mba" } }), [ME]);
  assert.strictEqual(s.roster.constructor, "mba");
  assert.strictEqual(foldMission(M, thread(boot, claim), [ME]).claims.length, 1);
});

test("a rejected claim is gone; a claim for a held seat never queues", () => {
  const rejected = foldMission(M, thread(boot, claimMac, { kind: "reject", re: 101, to: ["macos"] }), [ME]);
  assert.deepStrictEqual(rejected.claims, []);
  const late = foldMission(M, thread(boot, claimMac, acceptMac, { kind: "claim", from: { seat: "macos", device: "other" } }), [ME]);
  assert.deepStrictEqual(late.claims, []);
});

test("questions to the human stay open until a reply or decision answers them", () => {
  const ask = { kind: "question" as const, from: { seat: "macos", device: "mba" }, to: ["human"], text: "Install Firefox?" };
  const open = foldMission(M, thread(boot, claimMac, acceptMac, ask), [ME]);
  assert.deepStrictEqual(open.asks.map((a) => [a.commentId, a.seat, a.kind]), [[103, "macos", "question"]]);
  // The human may answer from the Mac itself: any rostered device.
  const replied = foldMission(M, thread(boot, claimMac, acceptMac, ask, { kind: "reply", re: 103, to: ["macos"], from: { seat: "human", device: "mba" } }), [ME]);
  assert.deepStrictEqual(replied.asks, []);
  const strangerReply = foldMission(M, thread(boot, claimMac, acceptMac, ask, { kind: "reply", re: 103, to: ["macos"], from: { seat: "human", device: "nobody" } }), [ME]);
  assert.strictEqual(strangerReply.asks.length, 1);
});

test("only the coordinator may ask the human for a decision", () => {
  const fromMac = { kind: "decision-request" as const, from: { seat: "macos", device: "mba" }, to: ["human"] };
  assert.deepStrictEqual(foldMission(M, thread(boot, claimMac, acceptMac, fromMac), [ME]).asks, []);
  const fromLead = { kind: "decision-request" as const, from: { seat: "coordinator", device: "win-pc" }, to: ["human"] };
  assert.strictEqual(foldMission(M, thread(boot, fromLead), [ME]).asks[0]?.kind, "decision-request");
});

test("an agent post from a seat nobody accepted asks nothing", () => {
  const s = foldMission(M, thread(boot, { kind: "question", from: { seat: "linux", device: "cachy" }, to: ["human"] }), [ME]);
  assert.deepStrictEqual(s.asks, []);
});

test("leave frees the seat; the lead can evict; nobody can evict the coordinator", () => {
  const left = foldMission(M, thread(boot, claimMac, acceptMac, { kind: "leave", from: { seat: "macos", device: "mba" } }), [ME]);
  assert.deepStrictEqual(left.roster, { coordinator: "win-pc" });
  const evicted = foldMission(M, thread(boot, claimMac, acceptMac, { kind: "leave", to: ["macos"] }), [ME]);
  assert.deepStrictEqual(evicted.roster, { coordinator: "win-pc" });
  const coup = foldMission(M, thread(boot, { kind: "leave", to: ["coordinator"] }), [ME]);
  assert.deepStrictEqual(coup.roster, { coordinator: "win-pc" });
});

test("pause, resume, status, moved and close", () => {
  const s = foldMission(M, thread(boot, claimMac, acceptMac,
    { kind: "pause", to: ["macos", "android"] },
    { kind: "status", from: { seat: "macos", device: "mba" }, text: "🟢 working" },
    { kind: "moved", data: { pr: 688 } },
  ), [ME]);
  assert.deepStrictEqual([s.paused, s.status.macos?.text, s.movedTo, s.closed], [["macos"], "h\n\n🟢 working", 688, false]);
  const resumed = foldMission(M, thread(boot, claimMac, acceptMac, { kind: "pause", to: ["macos"] }, { kind: "resume", to: ["macos"] }, { kind: "close" }), [ME]);
  assert.deepStrictEqual([resumed.paused, resumed.closed], [[], true]);
});

test("strangers and other missions change nothing, and order is by comment id", () => {
  const posts = thread(boot, { ...claimMac, author: "stranger" }, { ...claimMac, m: "zzzz99" });
  assert.deepStrictEqual(foldMission(M, posts, [ME]).claims, []);
  const shuffled = thread(boot, claimMac, acceptMac).reverse();
  assert.strictEqual(foldMission(M, shuffled, [ME]).roster.macos, "mba");
});

test("an edited comment never rewrites history: the lead cannot be taken over by editing its seating", () => {
  const posts = thread(boot, claimMac, acceptMac);
  const hijacked = thread({ ...boot, from: { seat: "human", device: "evil" }, data: { device: "evil" } })[0]!;
  posts[0] = { ...posts[0]!, body: hijacked.body, edited: true };
  const { state, verdicts } = foldFull(M, posts, [ME]);
  assert.strictEqual(state.lead, null);
  assert.deepStrictEqual(verdicts.get(posts[0]!.id), { applied: false, reason: "edited" });
});

test("status comments may be edited in place; nothing else may", () => {
  const status = { kind: "status" as const, from: { seat: "macos", device: "mba" }, text: "🟢 working" };
  const posts = thread(boot, claimMac, acceptMac, status);
  posts[3] = { ...posts[3]!, edited: true };
  assert.strictEqual(foldMission(M, posts, [ME]).status.macos?.text, "h\n\n🟢 working");
});

test("a post claiming this device that it never posted is a forgery, flagged and not applied", () => {
  const posts = thread(boot, claimMac, acceptMac, { kind: "pause", to: ["macos"] });
  const own = { ids: new Set([posts[0]!.id, posts[2]!.id]), pending: new Set<string>() };
  const { state, verdicts } = foldFull(M, posts, [ME], { me: "win-pc", ownPosts: own });
  assert.deepStrictEqual([state.forged, state.paused], [[posts[3]!.id], []]);
  assert.deepStrictEqual(verdicts.get(posts[3]!.id), { applied: false, reason: "forged_self" });
  assert.deepStrictEqual(foldFull(M, posts, [ME], { me: "mba", ownPosts: { ids: new Set(), pending: new Set() } }).state.paused, ["macos"]);
});

test("a post whose id never came back is ours by its nonce — but only the first one carrying it", () => {
  const posts = thread(boot, claimMac, acceptMac,
    { kind: "pause", to: ["macos"], data: { n: "nonce-1" } },
    { kind: "resume", to: ["macos"], data: { n: "nonce-1" } },
  );
  const own = { ids: new Set([posts[0]!.id, posts[2]!.id]), pending: new Set(["nonce-1"]) };
  const { state, verdicts } = foldFull(M, posts, [ME], { me: "win-pc", ownPosts: own });
  assert.strictEqual(verdicts.get(posts[3]!.id)?.applied, true, "the lost-answer post is still ours");
  assert.deepStrictEqual(verdicts.get(posts[4]!.id), { applied: false, reason: "forged_self" }, "a copy of its visible nonce is not");
  assert.deepStrictEqual([state.paused, state.forged], [["macos"], [posts[4]!.id]]);
});

test("after close, nothing more counts", () => {
  const s = foldFull(M, thread(boot, claimMac, { kind: "close" }, acceptMac), [ME]);
  assert.strictEqual(s.state.roster.macos, undefined);
  assert.deepStrictEqual(s.verdicts.get(103), { applied: false, reason: "mission_closed" });
});

test("a reply clears only the question of the seat it is addressed to", () => {
  const claimLinux = { kind: "claim" as const, from: { seat: "linux", device: "cachy" } };
  const acceptLinux = { kind: "accept" as const, to: ["linux"], data: { device: "cachy" } };
  const ask = { kind: "question" as const, from: { seat: "macos", device: "mba" }, to: ["human"] };
  const misdirected = { kind: "reply" as const, re: 105, to: ["linux"], from: { seat: "human" as const, device: "win-pc" } };
  const s = foldMission(M, thread(boot, claimMac, acceptMac, claimLinux, acceptLinux, ask, misdirected), [ME]);
  assert.deepStrictEqual(s.asks.map((a) => a.commentId), [105]);
});

test("a post judged before its seat was accepted stays out, even if the accept follows", () => {
  const early = { kind: "result" as const, from: { seat: "macos", device: "mba" }, to: ["coordinator"] };
  const { verdicts } = foldFull(M, thread(boot, claimMac, early, acceptMac), [ME]);
  assert.deepStrictEqual(verdicts.get(102), { applied: false, reason: "not_on_roster" });
});

test("a body that tries to be an envelope but is not one is unreadable, not the human's words", () => {
  const good = thread(claimMac)[0]!.body;
  const bodies = [
    'note\n\n<!-- ao:v1 {"m":"k3f9q2","kind":"result"} -->',
    good.replace(/ -->$/, "-->"),
    good.replace(/\n\n(<!-- ao:v1)/, "\n$1"),
  ];
  for (const [i, body] of bodies.entries()) {
    assert.deepStrictEqual(foldFull(M, [{ id: 1, author: ME, body }], [ME]).verdicts.get(1), { applied: false, reason: "unreadable_envelope" }, String(i));
  }
  assert.deepStrictEqual(foldFull(M, [{ id: 1, author: ME, body: "Skip Firefox." }], [ME]).verdicts.get(1), { applied: true, envelope: null, text: "Skip Firefox." });
});

test("an accept counts only as the human's click, not as an agent seat posting from the lead's device", () => {
  const asAgent = { kind: "accept" as const, to: ["macos"], data: { device: "mba" }, from: { seat: "coordinator", device: "win-pc" } };
  const { state, verdicts } = foldFull(M, thread(boot, claimMac, asAgent), [ME]);
  assert.strictEqual(state.roster.macos, undefined);
  assert.deepStrictEqual(verdicts.get(102), { applied: false, reason: "not_from_lead" });
});
