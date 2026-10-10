// Standalone Agent Office server: the API without the UI, e.g. for the Minecraft
// mod with the desktop app closed. Same `handle()` the desktop app embeds.
//
//   pnpm server                  # 127.0.0.1:3001; AO_SERVER_PORT overrides
//
// Shares ~/.claude and the SQLite db with any other running Agent Office: live
// runs belong to the process that spawned them, so do not drive one conversation
// from two servers at once.
import "./standalone-env";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { getRequestListener } from "@hono/node-server";
import { boot } from "./boot";
import { handle } from "./index";

// The desktop app's are set by next.config.mjs `headers()`; keep the two lists in step.
const SECURITY_HEADERS: Record<string, string> = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=(), interest-cohort=()",
};

async function handleWithHeaders(request: Request): Promise<Response> {
  const res = await handle(request);
  const headers = new Headers(res.headers);
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) headers.set(k, v);
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
}

// Starter data and project templates are looked up at request/boot time, relative to
// cwd, under the repo root (`apps/web/starter-data`, which the desktop bundle ships).
process.chdir(join(dirname(fileURLToPath(import.meta.url)), "..", "..", ".."));
// Not PORT: a shell opened from Agent Office inherits the desktop app's PORT.
const port = Number(process.env.AO_SERVER_PORT || "3001");

const server = createServer(getRequestListener(handleWithHeaders));
server.on("error", (err) => {
  console.error(`[server] cannot listen on 127.0.0.1:${port}:`, err.message);
  process.exit(1);
});
server.listen(port, "127.0.0.1", () => {
  // Discovery and every spawned agent's callbacks read these. A shell opened from
  // Agent Office inherits the desktop app's values, so overwrite them with ours.
  const bound = (server.address() as AddressInfo).port;
  process.env.PORT = String(bound);
  process.env.AO_BASE_URL = `http://127.0.0.1:${bound}`;
  console.warn(`[server] Agent Office API on ${process.env.AO_BASE_URL}`);
  void boot({ serve: true });
});

// `exit` handlers (the discovery file) only run on a real exit, not on a signal.
// SIGHUP: Windows sends it when the console window closes.
const SIGNAL_EXIT = { SIGHUP: 129, SIGINT: 130, SIGTERM: 143 } as const;
for (const [signal, code] of Object.entries(SIGNAL_EXIT)) process.once(signal, () => process.exit(code));
