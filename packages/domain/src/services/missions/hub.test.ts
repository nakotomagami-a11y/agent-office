import assert from "node:assert";
import { test } from "node:test";
import { ReviewError } from "../review/gh";
import { project } from "../review/fake-gh.test.support";
import type { Gh } from "../review/pulls";
import { createHub, listComments, postComment, remoteHasBranch, remoteHasCommit } from "./hub";

interface Call { args: string[]; input?: string }

function fakeGh(answer: (args: string[], input?: string) => string): { gh: Gh; calls: Call[] } {
  const calls: Call[] = [];
  return {
    calls,
    gh: { project, run: async (args, input) => { calls.push({ args, input }); return answer(args, input); } },
  };
}

const line = (id: number, body: string | null, author = "chaosandcurves", at = `2026-10-15T10:00:${String(id).padStart(2, "0")}Z`) =>
  JSON.stringify({ id, author, body, at, updated: at });

test("lists comments oldest first, with a null body as empty", async () => {
  const { gh, calls } = fakeGh(() => [line(12, "b"), line(11, null)].join("\n") + "\n");
  const got = await listComments(gh, 7, null);
  assert.deepStrictEqual(got.map((c) => [c.id, c.body]), [[11, ""], [12, "b"]]);
  assert.ok(calls[0]?.args.includes("--paginate"));
  assert.ok(!calls[0]?.args.some((a) => a.includes("since=")));
});

test("after a cursor: asks GitHub by time, then drops edited comments the cursor already passed", async () => {
  // A status comment (id 5) edited after the cursor comes back from `since`; it must not route again.
  const { gh, calls } = fakeGh(() => [line(5, "edited status"), line(20, "new")].join("\n"));
  const got = await listComments(gh, 7, { id: 19, at: "2026-10-15T10:00:19Z" });
  assert.deepStrictEqual(got.map((c) => c.id), [20]);
  // A minute early: GitHub stamps to the second, and the id filter drops the overlap.
  assert.ok(calls[0]?.args.some((a) => a.endsWith("&since=2026-10-15T09%3A59%3A19.000Z")));
});

test("output gh did not promise is an error, not a guess", async () => {
  const { gh } = fakeGh(() => JSON.stringify({ id: "x" }));
  await assert.rejects(listComments(gh, 7, null));
});

test("posting sends the body as JSON on stdin and returns the new cursor", async () => {
  const { gh, calls } = fakeGh(() => JSON.stringify({ id: 31, created_at: "2026-10-15T11:00:00Z", user: { login: "x" } }));
  const body = 'He said "hi"\n<!-- ao:v1 {} -->';
  assert.deepStrictEqual(await postComment(gh, 7, body), { id: 31, at: "2026-10-15T11:00:00Z" });
  assert.deepStrictEqual(JSON.parse(calls[0]?.input ?? ""), { body });
  assert.ok(calls[0]?.args.includes("POST"));
});

test("remote checks: present, missing (404/422), and other failures surface", async () => {
  const present = fakeGh(() => "abc\n");
  assert.strictEqual(await remoteHasBranch(present.gh, "feat/media-perception-phase0"), true);
  const missing = fakeGh(() => { throw new ReviewError("gh_failed", "gh: Not Found (HTTP 404)"); });
  assert.strictEqual(await remoteHasBranch(missing.gh, "feat/local-only"), false);
  const unknownSha = fakeGh(() => { throw new ReviewError("gh_failed", "No commit found for SHA (HTTP 422)"); });
  assert.strictEqual(await remoteHasCommit(unknownSha.gh, "a202c749"), false);
  const down = fakeGh(() => { throw new ReviewError("gh_unauthenticated", "HTTP 401"); });
  await assert.rejects(remoteHasBranch(down.gh, "main"), ReviewError);
});

test("a ref that could address another endpoint is never sent to GitHub", async () => {
  const { gh, calls } = fakeGh(() => "x");
  for (const bad of ["../../pulls/1", "main?x=1", "a b", "/abs", "feat/..", ""]) {
    assert.strictEqual(await remoteHasBranch(gh, bad), false, bad);
  }
  assert.strictEqual(await remoteHasCommit(gh, "HEAD~1"), false);
  assert.strictEqual(calls.length, 0);
});

test("creating a hub branches off the default branch through the API and opens a labelled draft", async () => {
  const { gh, calls } = fakeGh((args) => {
    if (args[0] === "repo") return "main\n";
    if (args[1]?.endsWith("/git/ref/heads/main")) return "f00d\n";
    if (args[0] === "pr") return "Creating draft pull request…\nhttps://github.com/Owner/Repo/pull/42\n";
    return "{}";
  });
  const hub = await createHub(gh, { missionId: "k3f9q2", title: "Media perception", body: "# Goal\n\nMeasure it." });
  assert.deepStrictEqual(hub, { number: 42, url: "https://github.com/Owner/Repo/pull/42", branch: "mission/k3f9q2" });

  const ref = calls.find((c) => c.args[1]?.endsWith("/git/refs"));
  assert.deepStrictEqual(JSON.parse(ref?.input ?? ""), { ref: "refs/heads/mission/k3f9q2", sha: "f00d" });
  const file = calls.find((c) => c.args[1]?.includes("/contents/.agent-office/missions/k3f9q2.md"));
  assert.strictEqual(Buffer.from(JSON.parse(file?.input ?? "").content, "base64").toString("utf8"), "# Goal\n\nMeasure it.");
  const pr = calls.find((c) => c.args[0] === "pr");
  assert.ok(pr?.args.includes("--draft") && pr.args.includes("ao-mission"));
  assert.strictEqual(pr?.input, "# Goal\n\nMeasure it.");
  assert.ok(!calls.some((c) => c.args[0] === "push" || c.args[0] === "checkout"));
});

test("a bad mission id or a pr create without a URL fails loudly", async () => {
  const quiet = fakeGh(() => "main");
  await assert.rejects(createHub(quiet.gh, { missionId: "../x", title: "t", body: "b" }), ReviewError);
  assert.strictEqual(quiet.calls.length, 0);
  await assert.rejects(createHub(quiet.gh, { missionId: "k3f9q2", title: "t", body: "b" }), /no PR url/);
});

test("a comment whose updated time differs from its created time comes back marked edited", async () => {
  const { gh } = fakeGh(() => [
    JSON.stringify({ id: 1, author: "a", body: "x", at: "2026-10-15T10:00:00Z", updated: "2026-10-15T10:00:00Z" }),
    JSON.stringify({ id: 2, author: "a", body: "y", at: "2026-10-15T10:00:00Z", updated: "2026-10-15T11:00:00Z" }),
  ].join("\n"));
  assert.deepStrictEqual((await listComments(gh, 7, null)).map((c) => c.edited), [false, true]);
});
