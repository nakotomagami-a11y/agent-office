/**
 * A chat's live process against the REAL claude CLI and a mock Anthropic API (no network): the
 * contract execution/chat-session.ts is built on, which chat-session.test.ts's stub imitates.
 *   - a message written while a tool runs reaches the model in the next request, in the same turn;
 *   - a message written while the model writes its answer runs as the next turn, same process;
 *   - Stop's interrupt ends the turn and keeps the process for the next message.
 * Asserts the CLI version it was verified on: a CLI update fails here first. Re-run it then.
 *
 * Needs `claude` on PATH (or AO_CLAUDE_BIN). Excluded from `pnpm test`; run it on its own:
 *   pnpm --filter @agent-office/domain test src/services/execution/runs.chat-session.e2e.test.ts
 */
import assert from "node:assert";
import { after, test } from "node:test";
import { createServer, type Server, type ServerResponse } from "node:http";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import type { ConversationRow } from "../db";
import { join } from "node:path";

const VERIFIED_CLI = "2.1.327";

interface Request { messages: Array<{ role: string; content: unknown }>; tools?: Array<{ name: string }> }
const requests: Request[] = [];
type Reply = { tool?: { id: string; command: string }; text?: string; delayMs?: number };
const script: Reply[] = [];

function sse(res: ServerResponse, reply: Reply): void {
  res.writeHead(200, { "content-type": "text/event-stream" });
  const ev = (type: string, d: object) => res.write(`event: ${type}\ndata: ${JSON.stringify({ type, ...d })}\n\n`);
  ev("message_start", { message: { id: `m${Math.random()}`, type: "message", role: "assistant", model: "claude-x", content: [], stop_reason: null, usage: { input_tokens: 3, output_tokens: 1 } } });
  if (reply.tool) {
    ev("content_block_start", { index: 0, content_block: { type: "tool_use", id: reply.tool.id, name: "Bash", input: {} } });
    ev("content_block_delta", { index: 0, delta: { type: "input_json_delta", partial_json: JSON.stringify({ command: reply.tool.command, description: "wait" }) } });
  } else {
    ev("content_block_start", { index: 0, content_block: { type: "text", text: "" } });
    ev("content_block_delta", { index: 0, delta: { type: "text_delta", text: reply.text ?? "ok" } });
  }
  ev("content_block_stop", { index: 0 });
  ev("message_delta", { delta: { stop_reason: reply.tool ? "tool_use" : "end_turn" }, usage: { output_tokens: 2 } });
  ev("message_stop", {});
  res.end();
}

const servers: Server[] = [];
after(() => servers.forEach((s) => s.close()));
const mock = createServer((req, res) => {
  let body = "";
  req.on("data", (c: Buffer) => { body += c.toString(); });
  req.on("end", () => {
    if (!req.url?.includes("/v1/messages") || req.url.includes("count_tokens")) {
      res.writeHead(404);
      return res.end("{}");
    }
    const parsed: unknown = JSON.parse(body);
    const request = parsed as Request;
    if (!(request.tools ?? []).some((t) => t.name === "Bash")) return sse(res, { text: "title" });
    requests.push(request);
    const reply = script.shift() ?? { text: "ok" };
    if (reply.delayMs) setTimeout(() => sse(res, reply), reply.delayMs);
    else sse(res, reply);
  });
});
servers.push(mock);
await new Promise<void>((resolve) => mock.listen(0, "127.0.0.1", resolve));
const address = mock.address();
const mockUrl = `http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}`;

const sandbox = mkdtempSync(join(tmpdir(), "ao-chat-e2e-"));
process.env.HOME = sandbox;
process.env.USERPROFILE = sandbox;
process.env.AO_BASE_URL = mockUrl;
process.env.CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC = "1";

const { AGENTS_DIR } = await import("../infra/paths");
mkdirSync(AGENTS_DIR, { recursive: true });
writeFileSync(join(AGENTS_DIR, "dev.md"), "---\nname: dev\ndescription: test agent\npermission-mode: bypassPermissions\n---\nYou help.\n");
const providers = await import("../providers/index");
providers.saveConfig("anthropic_api", { apiKey: "sk-ant-api03-e2e-chat-session-00000" });
(await import("../providers/store")).setSelection("anthropic_api", "chosen");

const db = await import("../db");
const chat = await import("./chat-session");
const { abortRun } = await import("./runs");
const { getHealth } = await import("../infra/health");
after(() => chat.killAllSessions());

/** The CLI refuses a bare `sleep N` as a tool call; a node timer it runs. */
const WAIT = (seconds: number) => `node -e "setTimeout(() => {}, ${seconds * 1000})"`;
const flat = (content: unknown): string => JSON.stringify(content);
const turnsOf = (convId: string) => db.listConversationTurns(convId);
let seq = 0;
const send = (conv: ConversationRow, text: string) => chat.deliver({ ...conv }, { id: `11111111-2222-4333-8444-${String(++seq).padStart(12, "0")}`, text, origin: "user" }, {});

async function until<T>(what: string, probe: () => T | undefined | false | null, ms = 60_000): Promise<T> {
  const end = Date.now() + ms;
  for (;;) {
    const v = probe();
    if (v) return v;
    if (Date.now() > end) throw new Error(`timed out waiting for ${what}`);
    await new Promise((r) => setTimeout(r, 50));
  }
}

test(`the CLI is the version this contract was verified on (${VERIFIED_CLI})`, async () => {
  const { version } = await getHealth(true);
  assert.ok(version?.startsWith(VERIFIED_CLI), `claude ${version}: re-run this file and the stub in chat-session.test.ts against it, then bump VERIFIED_CLI`);
});

test("a message written while a tool runs reaches the model in the same turn", async () => {
  const conv = db.startNewConversation("dev", "midturn", null);
  script.push({ tool: { id: "tu_wait", command: WAIT(4) } }, { text: "done with both" });
  await send(conv, "start the long thing");
  const turn = await until("the turn", () => chat.openTurnId(conv.id));
  await until("the tool call", () => requests.length > 0 && db.listConversationTurns(conv.id)[0]?.toolCalls?.length);
  await send(conv, "also say hi");
  await until("the turn to end", () => turnsOf(conv.id)[0]?.status === "done");
  const [only] = turnsOf(conv.id);
  assert.equal(turnsOf(conv.id).length, 1);
  assert.equal(only!.id, turn);
  assert.deepEqual(only!.inputs?.map((i) => i.text), ["also say hi"]);
  assert.match(flat(requests.at(-1)!.messages.at(-1)!.content), /also say hi/, "the model saw it alongside the tool result");
});

test("a message written while the model writes its answer runs as the next turn of the same process", async () => {
  const conv = db.startNewConversation("dev", "late", null);
  requests.length = 0;
  script.push({ text: "first answer", delayMs: 2500 }, { text: "second answer" });
  await send(conv, "one");
  await until("the answer to be in progress", () => requests.length === 1);
  await send(conv, "two");
  await until("two turns", () => turnsOf(conv.id).filter((t) => t.status === "done").length === 2);
  const [a, b] = turnsOf(conv.id);
  assert.equal(a!.prompt, "one");
  assert.equal(b!.prompt, "two");
  assert.match(b!.output, /second answer/);
  assert.equal(a!.sessionId, b!.sessionId, "one session");
});

test("Stop interrupts the turn and the next message goes to the same process", async () => {
  const conv = db.startNewConversation("dev", "stop", null);
  script.push({ tool: { id: "tu_long", command: WAIT(30) } }, { text: "after stop" });
  await send(conv, "long job");
  const turn = await until("the tool call", () => (turnsOf(conv.id)[0]?.toolCalls?.length ? chat.openTurnId(conv.id) : null));
  assert.equal(abortRun(turn), true);
  await until("stopped", () => turnsOf(conv.id)[0]?.status === "error");
  assert.equal(turnsOf(conv.id)[0]!.errorCode, "stopped");
  assert.equal(chat.hasLiveProcess(conv.id), true, "the process outlives the turn");
  await send(conv, "carry on");
  await until("the next turn", () => turnsOf(conv.id)[1]?.status === "done");
  assert.match(turnsOf(conv.id)[1]!.output, /after stop/);
});
