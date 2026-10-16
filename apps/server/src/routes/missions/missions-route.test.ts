/**
 * The mission routes' own guards — everything decided before a domain call, so no gh or git runs:
 * cross-site requests, malformed ids and bodies, and the local seat lookup.
 *
 *   pnpm --filter @agent-office/server test src/routes/missions/missions-route.test.ts
 */
import assert from "node:assert";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

const home = mkdtempSync(join(tmpdir(), "missions-route-"));
process.env.HOME = home;
process.env.USERPROFILE = home;

const json = async (res: Response) => ({ status: res.status, body: (await res.json()) as Record<string, unknown> });
const post = (url: string, body: unknown, headers: Record<string, string> = {}) =>
  new Request(`http://localhost${url}`, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) });
const params = <T extends Record<string, string>>(p: T) => ({ params: Promise.resolve(p) });

test("a request another site made is refused before anything runs", async () => {
  const start = await import("./route");
  const res = await start.POST(post("/api/missions", {}, { "sec-fetch-site": "cross-site" }));
  assert.deepStrictEqual(await json(res), { status: 403, body: { error: "forbidden" } });
  const list = await start.GET(new Request("http://localhost/api/missions?projectId=p", { headers: { "sec-fetch-site": "same-site" } }));
  assert.strictEqual(list.status, 403);
});

test("starting validates the whole manifest shape", async () => {
  const { POST } = await import("./route");
  const seat = { seat: "coordinator", agent: "orchestrator", os: "any", brief: "" };
  const good = { projectId: "proj", title: "t", goal: "", budgetUsd: 20, capUsd: 5, seats: [seat] };
  const bad: Record<string, unknown> = {
    seatHuman: { ...good, seats: [{ ...seat, seat: "human" }] },
    agentPath: { ...good, seats: [{ ...seat, agent: "../x" }] },
    osUnknown: { ...good, seats: [{ ...seat, os: "beos" }] },
    budget: { ...good, budgetUsd: 0 },
    nul: { ...good, title: "a\0b" },
    projectPath: { ...good, projectId: "../etc" },
  };
  for (const [name, body] of Object.entries(bad)) assert.strictEqual((await POST(post("/api/missions", body))).status, 400, name);
});

test("ids in the path must be a mission id and a comment id", async () => {
  const claim = await import("./[id]/claims/[commentId]/route");
  const r1 = await claim.POST(post("/x", { accept: true }), params({ id: "NOT-AN-ID", commentId: "5" }));
  assert.deepStrictEqual(await json(r1), { status: 400, body: { error: "invalid_mission_id" } });
  for (const commentId of ["0", "1e3", "-1", "abc", "12345678901234567"]) {
    const r = await claim.POST(post("/x", { accept: true }), params({ id: "k3f9q2", commentId }));
    assert.deepStrictEqual(await json(r), { status: 400, body: { error: "invalid_comment_id" } }, commentId);
  }
});

test("a chat that is no mission seat says so, without touching GitHub", async () => {
  const { GET } = await import("./seat/route");
  assert.deepStrictEqual(await json(await GET(new Request("http://localhost/api/missions/seat?instanceId=developer-abc"))), { status: 200, body: { seat: null } });
  assert.strictEqual((await GET(new Request("http://localhost/api/missions/seat"))).status, 400);
});

test("a mission this device holds no seat in answers with the code and its fix", async () => {
  const { GET } = await import("./[id]/route");
  const { status, body } = await json(await GET(new Request("http://localhost/api/missions/k3f9q2"), params({ id: "k3f9q2" })));
  assert.strictEqual(status, 403);
  assert.strictEqual(body.error, "not_seated");
  assert.ok(typeof body.hint === "string" && body.hint.length > 10);
});
