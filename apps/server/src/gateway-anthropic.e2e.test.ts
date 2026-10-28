/**
 * The REAL claude CLI → this gateway → a mock Anthropic API (anthropic_api passthrough): the stored
 * key goes upstream as x-api-key, the run token never does, and the answer streams back unchanged.
 * The mock URL is a test-only argument of the gateway handler; the route never passes it.
 *
 * Needs `claude` on PATH (or AO_CLAUDE_BIN). Excluded from `pnpm test`; run it on its own:
 *   pnpm --filter @agent-office/server test src/gateway-anthropic.e2e.test.ts
 */
import assert from "node:assert";
import { after, test } from "node:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const home = mkdtempSync(join(tmpdir(), "gateway-anthropic-e2e-"));
process.env.HOME = home;
process.env.USERPROFILE = home;

const { listen, runClaude, serveGateway, servers } = await import("./gateway-e2e.test.support");
const { providers } = await import("@agent-office/domain/services");
const { issueGatewayToken } = await import("@agent-office/domain/services/providers/gateway-tokens");
after(() => servers.forEach((s) => s.close()));

const KEY = "sk-ant-api03-e2e-stored-key-00000";

test("anthropic_api: the CLI's request reaches Anthropic with the stored key only, and the answer comes back", async () => {
  const seen: Array<{ url?: string; apiKey?: string; auth?: string; beta?: string }> = [];
  const anthropic = await listen((req, _body, res) => {
    const header = (name: string) => { const v = req.headers[name]; return typeof v === "string" ? v : undefined; };
    seen.push({ url: req.url, apiKey: header("x-api-key"), auth: header("authorization"), beta: header("anthropic-beta") });
    res.writeHead(200, { "content-type": "text/event-stream", "anthropic-ratelimit-requests-remaining": "9" });
    const ev = (type: string, d: object) => res.write(`event: ${type}\ndata: ${JSON.stringify({ type, ...d })}\n\n`);
    ev("message_start", { message: { id: "m", type: "message", role: "assistant", model: "claude-x", content: [], stop_reason: null, usage: { input_tokens: 3, output_tokens: 1 } } });
    ev("content_block_start", { index: 0, content_block: { type: "text", text: "" } });
    ev("content_block_delta", { index: 0, delta: { type: "text_delta", text: "passthrough works" } });
    ev("content_block_stop", { index: 0 });
    ev("message_delta", { delta: { stop_reason: "end_turn" }, usage: { output_tokens: 2 } });
    ev("message_stop", {});
    res.end();
  });
  providers.saveConfig("anthropic_api", { apiKey: KEY });
  const gatewayUrl = await serveGateway({ anthropicUrl: `${anthropic}/v1/messages` });
  const token = issueGatewayToken("e2e-anthropic", "anthropic_api");
  const out = await runClaude(home, { provider: "anthropic_api", gatewayUrl, token }, "Reply with only OK.");
  assert.ok(out.includes('"result":"passthrough works"'), out.slice(-600));
  assert.ok(seen.length >= 1);
  assert.ok(seen.every((s) => s.apiKey === KEY && s.auth === undefined && s.url?.startsWith("/v1/messages")), JSON.stringify(seen));
  assert.ok(seen.every((s) => (s.beta ?? "").includes("claude-code")), "the CLI's beta header passes through");
});
