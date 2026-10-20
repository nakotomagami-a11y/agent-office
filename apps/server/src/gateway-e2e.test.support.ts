// Shared by the real-CLI gateway e2e files: a local HTTP server, the gateway mounted on one, and a
// `claude -p` run against a pin. Nothing here talks to the network.
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { handleGatewayMessages } from "./lib/gateway";
import type { GatewayOptions } from "./lib/gateway-fetch";
import { buildSettingsPin, scrubBackendEnv, type ProviderEnvInput } from "@agent-office/domain/services/providers/env";
import { spawnClaude } from "@agent-office/domain/services/infra/claude-bin";

export const servers: Server[] = [];

export async function listen(handler: (req: IncomingMessage, body: string, res: ServerResponse) => void | Promise<void>): Promise<string> {
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

/** The gateway, served over real HTTP the way the CLI reaches it. */
export function serveGateway(opts: GatewayOptions = {}): Promise<string> {
  return listen(async (req, body, res) => {
    const request = new Request(`http://127.0.0.1${req.url}`, { method: req.method, headers: req.headers as Record<string, string>, body });
    const response = req.url?.includes("count_tokens") ? new Response("{}", { status: 404 }) : await handleGatewayMessages(request, opts);
    res.writeHead(response.status, Object.fromEntries(response.headers));
    res.end(Buffer.from(await response.arrayBuffer()));
  });
}

export function runClaude(home: string, pin: ProviderEnvInput, prompt: string): Promise<string> {
  const file = join(home, `pin-${Date.now()}.json`);
  writeFileSync(file, JSON.stringify(buildSettingsPin(pin)));
  const env: NodeJS.ProcessEnv = { ...process.env, CLAUDE_CONFIG_DIR: mkdtempSync(join(tmpdir(), "ao-cfg-")), CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: "1" };
  scrubBackendEnv(env);
  const cwd = mkdtempSync(join(tmpdir(), "ao-e2e-cwd-"));
  return new Promise((resolve) => {
    const proc = spawnClaude(["--settings", file, "-p", "--output-format", "stream-json", "--verbose", "--permission-mode", "bypassPermissions"], { cwd, env, stdio: ["pipe", "pipe", "pipe"] });
    let text = "";
    proc.stdout?.on("data", (d: Buffer) => { text += d.toString(); });
    proc.on("close", () => resolve(text));
    proc.stdin?.end(prompt);
  });
}
