/**
 * Stop, end to end over real sockets: the gateway is served by `getRequestListener(handle)` exactly
 * as main.ts serves it; when the client (the killed CLI) disconnects, the upstream request must be
 * cancelled too (no further tokens billed) and no provider failure recorded. No `claude` needed.
 *
 *   pnpm --filter @agent-office/server test src/routes/gateway/gateway-abort.test.ts
 */
import assert from "node:assert";
import { after, test } from "node:test";
import { createServer, request as httpRequest, type Server } from "node:http";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getRequestListener } from "@hono/node-server";

const home = mkdtempSync(join(tmpdir(), "gateway-abort-"));
process.env.HOME = home;
process.env.USERPROFILE = home;

const { handle } = await import("../../index");
const { gateway, providers } = await import("@agent-office/domain/services");
const tokens = await import("@agent-office/domain/services/providers/gateway-tokens");

const servers: Server[] = [];
after(() => servers.forEach((s) => s.close()));
const portOf = (s: Server): number => {
  const a = s.address();
  return typeof a === "object" && a ? a.port : 0;
};
const listen = (s: Server): Promise<number> => new Promise((resolve) => s.listen(0, "127.0.0.1", () => resolve(portOf(s))));

test("a client that disconnects mid-request cancels the upstream request, and no failure is recorded", async () => {
  let upstreamClosed: () => void = () => {};
  const closed = new Promise<void>((resolve) => { upstreamClosed = resolve; });
  let upstreamGotRequest: () => void = () => {};
  const received = new Promise<void>((resolve) => { upstreamGotRequest = resolve; });
  const upstream = createServer((req) => {
    upstreamGotRequest();
    req.socket.on("close", () => upstreamClosed());
  });
  servers.push(upstream);
  const upstreamPort = await listen(upstream);

  providers.saveConfig("openai", { baseUrl: `http://127.0.0.1:${upstreamPort}/v1`, apiKey: "sk-proj-abort-key-00000000000", models: { haiku: "m", sonnet: "m", opus: "m" } });
  const token = tokens.issueGatewayToken("run-abort", "openai");
  const failures: string[] = [];
  gateway.onGatewayFailure((owner, code) => void failures.push(`${owner}:${code}`));

  const gw = createServer(getRequestListener(handle));
  servers.push(gw);
  const gwPort = await listen(gw);
  const body = JSON.stringify({ model: "m", max_tokens: 10, stream: true, messages: [{ role: "user", content: "hi" }] });
  const client = httpRequest({
    host: "127.0.0.1", port: gwPort, method: "POST", path: "/api/gateway/v1/messages",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json", "content-length": Buffer.byteLength(body) },
  });
  client.on("error", () => {});
  client.end(body);

  await received;
  client.destroy();
  const timeout = new Promise<string>((resolve) => setTimeout(() => resolve("timeout"), 5_000).unref());
  assert.notEqual(await Promise.race([closed.then(() => "closed"), timeout]), "timeout", "the upstream connection stayed open after Stop");
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.deepStrictEqual(failures, []);
});
