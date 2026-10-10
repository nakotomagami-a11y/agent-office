import assert from "node:assert";
import { globSync } from "node:fs";
import { test } from "node:test";
import { createHandler } from "./index";
import { ROUTES } from "./route-table";
import { createRouter, type RouteEntry } from "./router";

const ok = (body: string) => () => new Response(body);

test("the route table lists exactly the route files on disk", () => {
  const onDisk = globSync("src/routes/**/route.ts")
    .map((f) => "/api" + f.split("\\").join("/").slice("src/routes".length, -"/route.ts".length))
    .sort();
  assert.deepStrictEqual(
    ROUTES.map((r) => r.path).sort(),
    onDisk,
    "stale src/route-table.ts — run `pnpm --filter @agent-office/server routes`",
  );
});

test("every route in the real table resolves to itself, whatever the table order", () => {
  const orders = [ROUTES, [...ROUTES].reverse()];
  let seed = 7;
  for (let n = 0; n < 50; n++) {
    const shuffled = [...ROUTES];
    for (let i = shuffled.length - 1; i > 0; i--) {
      seed = (seed * 1103515245 + 12345) % 2 ** 31;
      const j = seed % (i + 1);
      [shuffled[i], shuffled[j]] = [shuffled[j]!, shuffled[i]!];
    }
    orders.push(shuffled);
  }
  for (const order of orders) {
    const match = createRouter(order);
    for (const { path } of ROUTES) assert.strictEqual(match(path)?.entry.path, path, path);
  }
});

test("a static segment beats a dynamic one, whatever the table order", () => {
  const match = createRouter([
    { path: "/api/agents/[id]", module: { GET: ok("dynamic") } },
    { path: "/api/agents/bulk", module: { GET: ok("static") } },
  ]);
  assert.strictEqual(match("/api/agents/bulk")?.entry.path, "/api/agents/bulk");
  assert.deepStrictEqual(match("/api/agents/dev%20ops")?.params, { id: "dev ops" });
  assert.strictEqual(match("/api/agents/a/b"), null);
  assert.strictEqual(match("/api/agents/%E0%A4%A"), null, "malformed escapes are a 404, not a throw");
});

const routes: RouteEntry[] = [
  {
    path: "/api/things/[id]",
    module: {
      async GET(_req, { params }) {
        return Response.json(await params);
      },
      POST() {
        throw new Error("boom");
      },
    },
  },
];
const handle = createHandler(routes);
const req = (method: string, path: string, headers: Record<string, string> = {}) =>
  new Request(`http://127.0.0.1:3001${path}`, { method, headers: { host: "127.0.0.1:3001", ...headers } });

test("dispatches by method and hands the handler its params", async () => {
  const res = await handle(req("GET", "/api/things/42"));
  assert.deepStrictEqual(await res.json(), { id: "42" });
});

test("unknown path is 404, unknown method is 405 with Allow", async () => {
  assert.strictEqual((await handle(req("GET", "/api/nope"))).status, 404);
  const res = await handle(req("DELETE", "/api/things/1"));
  assert.strictEqual(res.status, 405);
  assert.strictEqual(res.headers.get("allow"), "GET, POST, HEAD, OPTIONS");
});

test("HEAD falls back to GET and OPTIONS is answered, as Next does", async () => {
  assert.strictEqual((await handle(req("HEAD", "/api/things/1"))).status, 200);
  assert.strictEqual((await handle(req("OPTIONS", "/api/things/1"))).status, 204);
});

test("a throwing handler is a 500 machine code, not a crashed server", async () => {
  const res = await handle(req("POST", "/api/things/1"));
  assert.strictEqual(res.status, 500);
  assert.deepStrictEqual(await res.json(), { error: "internal_error" });
});

test("the standalone server applies the same host and origin guard as the desktop app", async () => {
  assert.strictEqual((await handle(req("GET", "/api/things/1", { host: "evil.example" }))).status, 403);
  const csrf = req("POST", "/api/things/1", { origin: "http://evil.example" });
  assert.strictEqual((await handle(csrf)).status, 403);
});
