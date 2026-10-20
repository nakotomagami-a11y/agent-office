/**
 * The REAL claude CLI → this gateway → a mock OpenAI server, with a tool call round trip. Every
 * request the mock sees must be a main-loop request (tools and the system prompt present): no side
 * call answers a permission or safety question with the provider's model (design D-14).
 *
 * Needs `claude` on PATH (or AO_CLAUDE_BIN). Excluded from `pnpm test`; run it on its own:
 *   pnpm --filter @agent-office/server test src/gateway.e2e.test.ts
 */
import assert from "node:assert";
import { after, test } from "node:test";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const home = mkdtempSync(join(tmpdir(), "gateway-e2e-"));
process.env.HOME = home;
process.env.USERPROFILE = home;

const { handleGatewayMessages } = await import("./lib/gateway");
const { providers } = await import("@agent-office/domain/services");
const { issueGatewayToken } = await import("@agent-office/domain/services/providers/gateway-tokens");
const { buildSettingsPin, scrubBackendEnv } = await import("@agent-office/domain/services/providers/env");
const { spawnClaude } = await import("@agent-office/domain/services/infra/claude-bin");

const servers: Server[] = [];
after(() => servers.forEach((s) => s.close()));

async function listen(handler: (req: IncomingMessage, body: string, res: ServerResponse) => void | Promise<void>): Promise<string> {
  const server = createServer((req, res) => {
    let body = "";
    req.on("data", (c: Buffer) => { body += c.toString(); });
    req.on("end", () => void handler(req, body, res));
  });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  return `http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}`;
}

interface ChatBody { model: string; tools?: unknown[]; messages: Array<{ role: string; content: unknown }> }
const seen: ChatBody[] = [];
const sse = (res: ServerResponse, chunks: object[]) => {
  res.writeHead(200, { "content-type": "text/event-stream" });
  for (const c of chunks) res.write(`data: ${JSON.stringify(c)}\n\n`);
  res.end("data: [DONE]\n\n");
};

test("a tool call round trip through the gateway, main-loop requests only", async () => {
  const openai = await listen((_req, body, res) => {
    const parsed: unknown = JSON.parse(body);
    const chat = parsed as ChatBody;
    seen.push(chat);
    const answered = chat.messages.some((m) => m.role === "tool");
    sse(res, answered
      ? [{ choices: [{ delta: { content: "gateway works" }, finish_reason: "stop" }] }, { choices: [], usage: { prompt_tokens: 9, completion_tokens: 2 } }]
      : [{ choices: [{ delta: { tool_calls: [{ index: 0, id: "call_1", function: { name: "Bash", arguments: '{"command":"echo hi","description":"say hi"}' } }] }, finish_reason: "tool_calls" }] }]);
  });
  providers.saveConfig("openai", { baseUrl: `${openai}/v1`, apiKey: "sk-proj-e2e-key-000000000000", models: { haiku: "mock-small", sonnet: "mock-mid", opus: "mock-big" } });
  const gateway = await listen(async (req, body, res) => {
    const request = new Request(`http://127.0.0.1${req.url}`, { method: req.method, headers: req.headers as Record<string, string>, body });
    const response = req.url?.includes("count_tokens") ? new Response("{}", { status: 404 }) : await handleGatewayMessages(request);
    res.writeHead(response.status, Object.fromEntries(response.headers));
    res.end(Buffer.from(await response.arrayBuffer()));
  });
  const token = issueGatewayToken("e2e-run", "openai");
  const pin = join(home, "pin.json");
  writeFileSync(pin, JSON.stringify(buildSettingsPin({ provider: "openai", gatewayUrl: gateway, token, models: { haiku: "mock-small", sonnet: "mock-mid", opus: "mock-big" } })));
  const env: NodeJS.ProcessEnv = { ...process.env, CLAUDE_CONFIG_DIR: mkdtempSync(join(tmpdir(), "ao-cfg-")), CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: "1" };
  scrubBackendEnv(env);
  const cwd = mkdtempSync(join(tmpdir(), "ao-e2e-cwd-"));
  const out = await new Promise<string>((resolve) => {
    const proc = spawnClaude(["--settings", pin, "-p", "--output-format", "stream-json", "--verbose", "--permission-mode", "bypassPermissions"], { cwd, env, stdio: ["pipe", "pipe", "pipe"] });
    let text = "";
    proc.stdout?.on("data", (d: Buffer) => { text += d.toString(); });
    proc.on("close", () => resolve(text));
    proc.stdin?.end("Run echo hi, then report.");
  });
  assert.ok(out.includes('"result":"gateway works"'), out.slice(-600));
  assert.ok(seen.length >= 2);
  assert.ok(seen.every((r) => r.model === "mock-mid" && (r.tools?.length ?? 0) > 5 && r.messages[0]?.role === "system"), "main-loop requests only");
  const toolTurn = seen.find((r) => r.messages.some((m) => m.role === "tool"));
  assert.ok(toolTurn && JSON.stringify(toolTurn.messages).includes("hi"));
});
