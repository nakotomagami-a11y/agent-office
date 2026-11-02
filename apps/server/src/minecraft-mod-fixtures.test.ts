/**
 * The Minecraft mod parses responses leniently: a renamed field reads as null or 0 and the chat shows "idle" with no
 * error. This calls the real route handlers against a seeded home and compares their answers with the fixtures in
 * the mod's test resources, which the mod's FixturesTest parses. A server change that moves a field the mod reads
 * makes this fail; regenerate with `pnpm --filter @agent-office/server mod-fixtures` and the Java test then says
 * whether the mod still reads it.
 *
 *   pnpm --filter @agent-office/server test src/minecraft-mod-fixtures.test.ts
 */
import assert from "node:assert";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import type { LiveRun, ReplayableEvent } from "@agent-office/domain/services/execution/runs/types";
import type { Tab, TabsState } from "@agent-office/domain/types";
import { z } from "zod";

// A home of its own (inside run-tests' sandbox): the other test files share that one, and their agents and
// settings would land in the fixtures. Set before anything resolves a path, hence the dynamic imports.
const HOME = mkdtempSync(join(homedir(), "mod-fixtures-"));
process.env.HOME = HOME;
process.env.USERPROFILE = HOME;
const { db, paths, permissions, projects, review } = await import("@agent-office/domain/services");
const { liveRuns } = await import("@agent-office/domain/services/execution/runs/registry");
const { standard } = await import("@agent-office/domain/services/review/fake-gh.test.support");
const { reviewResponse } = await import("./lib/review-route");

const UPDATE = process.env.UPDATE_FIXTURES === "1";
const FIXTURES = new URL("../../minecraft-mod/src/test/resources/dev/agentoffice/mc/fixtures/", import.meta.url);
const T0 = 1767225600000;

const root = join(HOME, "code");
mkdirSync(join(root, "alpha"), { recursive: true });
mkdirSync(paths.AGENTS_DIR, { recursive: true });
writeFileSync(paths.SETTINGS_FILE, JSON.stringify({ projectsRoot: root, excluded: [], firstRunComplete: true }));
writeFileSync(join(paths.AGENTS_DIR, "developer.md"),
  "---\nname: developer\ndisplay-name: Dev\ndescription: Writes code.\nmodel: opus\neffort: high\n---\n\nYou write code.\n");

/** Values the server makes up (ids, clocks, paths) → stable stand-ins, so a fixture changes only with a shape. */
const stand: [string, string][] = [];
function stable(value: unknown): unknown {
  if (typeof value === "string") {
    let s = value;
    for (const [from, to] of stand) s = s.split(from).join(to);
    for (const home of [HOME, HOME.replace(/\\/g, "/")]) {
      if (s.includes(home)) s = s.split(home).join("/home").replace(/\\/g, "/");
    }
    return s;
  }
  if (typeof value === "number") return value > 1e12 ? T0 : value;
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") {
    // `rev` hashes the metadata, cwd included: it differs per machine.
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, k === "rev" && typeof v === "string" ? "rev" : stable(v)]));
  }
  return value;
}

function check(name: string, text: string): void {
  const file = new URL(name, FIXTURES);
  if (UPDATE) {
    mkdirSync(FIXTURES, { recursive: true });
    writeFileSync(file, text);
    return;
  }
  let committed = "";
  try { committed = readFileSync(file, "utf8").replace(/\r\n/g, "\n"); } catch { /* missing: fails below */ }
  assert.strictEqual(committed, text, `${name} is stale: run \`pnpm --filter @agent-office/server mod-fixtures\`, then the mod's tests`);
}

/** `made`: values this answer made up that later ones repeat, each with its stand-in. */
async function json(name: string, res: Response | Promise<Response>, made: (body: unknown) => [string, string][] = () => []): Promise<unknown> {
  const r = await res;
  assert.strictEqual(r.status, 200, `${name}: ${r.status}`);
  const body: unknown = await r.json();
  stand.push(...made(body));
  check(name, JSON.stringify(stable(body), null, 2) + "\n");
  return body;
}

const Added = z.object({ instance: z.object({ instanceId: z.string() }) });

const req = (path: string, method = "GET", body?: unknown) =>
  new Request(`http://localhost${path}`, { method, headers: { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
const params = <T extends Record<string, string>>(p: T) => ({ params: Promise.resolve(p) });

after(() => {
  for (const id of liveRuns.keys()) liveRuns.delete(id);
  permissions.denyAllForRun("run-live");
});

test("projects, roster and agents", async () => {
  const added = await json("roster-add.json", (await import("./routes/projects/[id]/roster/route"))
    .POST(req("/api/projects/alpha/roster", "POST", { agentId: "developer" }), params({ id: "alpha" })),
  (b) => [[Added.parse(b).instance.instanceId, "developer-fx01"]]);
  const { instanceId } = Added.parse(added).instance;
  const patched = await (await import("./routes/projects/[id]/roster/[instanceId]/route"))
    .PATCH(req("/x", "PATCH", { label: "Builder", model: "sonnet", effort: "low", permissionMode: "plan" }), params({ id: "alpha", instanceId }));
  assert.strictEqual(patched.status, 200);

  await json("projects.json", (await import("./routes/projects/route")).GET());
  await json("project.json", (await import("./routes/projects/[id]/route")).GET(req("/api/projects/alpha"), params({ id: "alpha" })));
  await json("agents.json", (await import("./routes/agents/route")).GET());
});

test("the desktop app's open tabs, stored as JSON in a ui setting", async () => {
  const tab = (id: string, projectId: string): Tab => ({ id, projectId, currentPath: `/projects/${projectId}`, createdAt: T0, lastActiveAt: T0 });
  const state: TabsState & { closedStack: Tab[] } = { tabs: [tab("tab-1", "alpha"), tab("tab-2", "beta")], activeTabId: "tab-1", closedStack: [] };
  const route = await import("./routes/ui-settings/route");
  assert.strictEqual((await route.PATCH(req("/api/ui-settings", "PATCH", { "tabs-state": JSON.stringify(state) }))).status, 200);
  await json("ui-settings.json", route.GET());
});

test("a running conversation: finished turn with tool calls, active run, queue; and its pending permission", async () => {
  const conv = db.ensureConversation("developer", "developer-fx01", "alpha");
  stand.push([conv.id, "conv-1"]);
  const base = { agentId: "developer", agentName: "developer", instanceId: "developer-fx01", projectId: "alpha", model: "opus", effort: "high", conversationId: conv.id };
  db.insertRun({ ...base, id: "run-done", status: "running", prompt: "Read a.ts", startedAt: T0 });
  db.insertToolCall("run-done", "Read", { file_path: "a.ts" }, T0, "toolu-1");
  db.updateRun("run-done", { status: "done", exitCode: 0, output: "Read it.", tokensIn: 1200, tokensOut: 34, costUsd: 0.05, durMs: 4000, endedAt: T0 });
  db.insertRun({ ...base, id: "run-live", status: "running", prompt: "Now fix it", startedAt: T0 + 1 });
  db.updateConversation(conv.id, { status: "running", activeRunId: "run-live" });
  db.replaceQueue(conv.id, [{ id: "queued-fixture", text: "And test it" }]);
  stand.push(["queued-fixture", "queued-1"]);

  const conversations = await import("./routes/conversations/route");
  await json("conversation.json", conversations.GET(req("/api/conversations?agentId=developer&instanceId=developer-fx01")));
  await json("conversation-open.json", conversations.POST(req("/api/conversations", "POST", { agentId: "developer", instanceId: "developer-fx01", projectId: "alpha" })));

  void permissions.requestPermission({ runId: "run-live", tool: "Bash", input: { command: "rm -rf build" }, onCreated: (p) => stand.push([p.id, "perm-1"]) });
  await json("permissions.json", (await import("./routes/runs/[id]/permission/route")).GET(req("/api/runs/run-live/permission"), params({ id: "run-live" })));
});

test("a run's stream: every event the mod's transcript reads", async () => {
  const runId = "run-stream";
  const eventLog: ReplayableEvent[] = [
    { name: "chunk", data: { runId, text: "Looking." } },
    { name: "tool", data: { runId, name: "Read", toolUseId: "toolu-2", ts: T0 } },
    { name: "tool", data: { runId, name: "Read", toolUseId: "toolu-2", input: { file_path: "a.ts" }, ts: T0 } },
    { name: "tool-done", data: { runId, toolUseId: "toolu-2", ts: T0 } },
    { name: "subagent", data: { type: "subagent", parentRunId: runId, subRunId: "sub-1", agentId: "qa-code-review", prompt: "Review", status: "running", startTs: T0 } },
    { name: "subagent-update", data: { type: "subagent-update", subRunId: "sub-1", status: "running", currentTool: "Grep", tokensIn: 5, tokensOut: 6, cost: 0.01, lastOutputLine: "Reading the diff" } },
    { name: "rate-limit", data: { runId, message: "Approaching your usage limit", severity: "warning" } },
    { name: "usage", data: { runId, tokensIn: 2400, tokensOut: 80, cost: 0.12 } },
  ];
  const run = {
    id: runId, status: "error", exitCode: 1, startTs: T0, finishedAt: T0 + 9000, tokensIn: 2400, tokensOut: 80, cost: 0.12,
    subscribers: new Set(), eventLog, error: { code: "auth_expired", detail: "Log in again" },
  } satisfies Partial<LiveRun>;
  liveRuns.set(runId, run as unknown as LiveRun);
  const abort = new AbortController();
  const res = await (await import("./routes/runs/[id]/stream/route"))
    .GET(new Request(`http://localhost/api/runs/${runId}/stream`, { signal: abort.signal }), params({ id: runId }));
  const reader = res.body!.getReader();
  let text = "";
  while (!text.includes("event: done")) text += new TextDecoder().decode((await reader.read()).value);
  abort.abort();
  check("stream.txt", text);
});

test("a PR queue and one PR, as the review routes answer them (gh faked)", async () => {
  const project = projects.readProject("alpha")!;
  const seat = project.meta.roster[0]!.instanceId;
  const gh = standard({ headRefName: `agent/${seat}-1716800000000` });
  const one = JSON.parse(await gh({ args: ["pr", "view"], cwd: "", env: {} })) as unknown;
  await json("reviews.json", reviewResponse(await review.listPulls(project, async () => JSON.stringify([one]))));
  await json("review.json", reviewResponse(await review.getPull(project, 7, async (c) => gh(c))));
});
