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
import type { ServerResponse } from "node:http";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const home = mkdtempSync(join(tmpdir(), "gateway-e2e-"));
process.env.HOME = home;
process.env.USERPROFILE = home;

const { listen, runClaude, serveGateway, servers } = await import("./gateway-e2e.test.support");
const { providers } = await import("@agent-office/domain/services");
const { issueGatewayToken } = await import("@agent-office/domain/services/providers/gateway-tokens");
after(() => servers.forEach((s) => s.close()));

interface ChatBody { model: string; tools?: unknown[]; messages: Array<{ role: string; content: unknown }> }
const seen: ChatBody[] = [];
const sse = (res: ServerResponse, chunks: object[]) => {
  res.writeHead(200, { "content-type": "text/event-stream" });
  for (const c of chunks) res.write(`data: ${JSON.stringify(c)}\n\n`);
  res.end("data: [DONE]\n\n");
};
const MODELS = { haiku: "mock-small", sonnet: "mock-mid", opus: "mock-big" };

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
  providers.saveConfig("openai", { baseUrl: `${openai}/v1`, apiKey: "sk-proj-e2e-key-000000000000", models: MODELS });
  const gatewayUrl = await serveGateway();
  const token = issueGatewayToken("e2e-run", "openai");
  const out = await runClaude(home, { provider: "openai", gatewayUrl, token, models: MODELS }, "Run echo hi, then report.");
  assert.ok(out.includes('"result":"gateway works"'), out.slice(-600));
  assert.ok(seen.length >= 2);
  assert.ok(seen.every((r) => r.model === "mock-mid" && (r.tools?.length ?? 0) > 5 && r.messages[0]?.role === "system"), "main-loop requests only");
  const toolTurn = seen.find((r) => r.messages.some((m) => m.role === "tool"));
  assert.ok(toolTurn && JSON.stringify(toolTurn.messages).includes("hi"));
});
