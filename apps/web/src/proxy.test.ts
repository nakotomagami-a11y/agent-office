/**
 * The app's ONLY origin check.
 *
 * `proxy.ts` (formerly `middleware.ts`) runs `@agent-office/server/guard` on every
 * path, pages included (the server's `handle()` runs it again on /api). It had no test, so a rename, a
 * matcher typo, or an inverted condition would remove the protection silently
 * and every other check in the repo would still pass.
 *
 * The Host allowlist is the DNS-rebinding defence. The app has no login, so a
 * page on evil.example re-pointed at 127.0.0.1 would otherwise drive the whole
 * API: it sends `Host: evil.example`, its Origin matches that Host, and reads
 * carry no Origin at all. The matcher covers every path because server-rendered
 * pages carry data too.
 *
 * Any port is accepted on purpose: a browser always sends the name it resolved,
 * so the hostname alone stops rebinding, and the Tauri shell, `next dev` and
 * AO_BASE_URL each pick their own port.
 *
 * Not covered: `next dev` answers its own `__nextjs_*` endpoints before the proxy
 * runs. Release builds have no such endpoints. A Host header is also not access
 * control against LAN peers, which can send any Host; every launch script binds
 * 127.0.0.1 for that.
 *
 *   pnpm --filter @agent-office/web test
 */
import assert from "node:assert";
import { AsyncLocalStorage } from "node:async_hooks";
import { test } from "node:test";
import { config, proxy } from "./proxy";
import type { NextRequest } from "next/server";

/** Minimal stand-in — proxy only reads `method` and `headers.get`. */
function req(method: string, headers: Record<string, string> = {}): NextRequest {
  const lower = new Map(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]));
  return {
    method,
    headers: { get: (name: string) => lower.get(name.toLowerCase()) ?? null },
  } as unknown as NextRequest;
}

const allowed = (r: NextRequest) => proxy(r).status !== 403;

test("a cross-origin write is rejected", () => {
  assert.equal(
    allowed(req("POST", { origin: "https://evil.example", host: "localhost:3000" })),
    false,
  );
});

test("a same-origin write is allowed", () => {
  assert.equal(
    allowed(req("POST", { origin: "http://localhost:3000", host: "localhost:3000" })),
    true,
  );
});

test("every unsafe method is guarded, not just POST", () => {
  for (const m of ["POST", "PUT", "PATCH", "DELETE"]) {
    assert.equal(
      allowed(req(m, { origin: "https://evil.example", host: "localhost:3000" })),
      false,
      `${m} was not guarded`,
    );
  }
});

test("safe methods pass through even cross-origin", () => {
  for (const m of ["GET", "HEAD", "OPTIONS"]) {
    assert.equal(
      allowed(req(m, { origin: "https://evil.example", host: "localhost:3000" })),
      true,
      `${m} should not be blocked`,
    );
  }
});

test("a write with no Origin header is allowed", () => {
  // Non-browser clients (curl, the CLI, native fetch) send none, and the app is
  // a localhost desktop tool. Documented so the omission reads as a decision.
  assert.equal(allowed(req("POST", { host: "localhost:3000" })), true);
});

test("an unparseable Origin is rejected rather than ignored", () => {
  assert.equal(allowed(req("POST", { origin: "not a url", host: "localhost:3000" })), false);
});

test("a port mismatch on the same hostname is still cross-origin", () => {
  assert.equal(
    allowed(req("POST", { origin: "http://localhost:9999", host: "localhost:3000" })),
    false,
  );
});

test("a rebinding page is rejected on reads, not just writes", () => {
  assert.equal(allowed(req("GET", { host: "evil.example:4517" })), false);
});

test("a rebinding write is rejected even though Origin matches Host", () => {
  assert.equal(
    allowed(req("POST", { origin: "http://evil.example:4517", host: "evil.example:4517" })),
    false,
  );
});

test("a request with no Host is rejected", () => {
  assert.equal(allowed(req("GET")), false);
});

test("loopback hosts are allowed with or without a port", () => {
  for (const host of ["localhost:3000", "127.0.0.1:4517", "[::1]:4517", "localhost", "LOCALHOST:3000"]) {
    assert.equal(allowed(req("GET", { host })), true, `${host} was rejected`);
  }
});

test("an uppercase loopback Host passes the write check too", () => {
  assert.equal(
    allowed(req("POST", { origin: "http://localhost:3000", host: "LOCALHOST:3000" })),
    true,
  );
});

test("any Host that is not literally a loopback name is rejected", () => {
  for (const host of [
    "127.0.0.1.nip.io:4517",
    "localhost.evil.example:4517",
    "192.168.1.20:3000",
    "localhost.:3000",
    "127.0.0.2:3000",
    "127.1:3000",
    "2130706433:3000",
    "[0:0:0:0:0:0:0:1]:3000",
    "[::ffff:127.0.0.1]:3000",
    "evil.example@localhost:3000",
    "localhost/evil:3000",
    "localhost\\evil.example",
    "local%68ost:3000",
    "localhost:3000 ",
    "localhost:123456",
  ]) {
    assert.equal(allowed(req("GET", { host })), false, `${host} was allowed`);
  }
});

test("a bad Host is reported with its own code", async () => {
  const body = (await proxy(req("GET", { host: "evil.example" })).json()) as { error: string };
  assert.equal(body.error, "host_not_allowed");
});

test("the proxy runs on every path, not just /api", async () => {
  const g = globalThis as { AsyncLocalStorage?: unknown };
  g.AsyncLocalStorage ??= AsyncLocalStorage;
  const { unstable_doesMiddlewareMatch } = await import("next/experimental/testing/server");
  for (const url of ["/", "/api/health", "/agents/x", "/_next/static/chunks/a.js", "/index.rsc"]) {
    assert.ok(unstable_doesMiddlewareMatch({ config, url }), `${url} skips the proxy`);
  }
});
