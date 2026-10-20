import assert from "node:assert";
import { realpathSync } from "node:fs";
import { createServer, type AddressInfo } from "node:net";
import { test } from "node:test";
import { parseEtime, parseLsofCwds, parseLsofListeners, parsePs } from "./darwin";
import { scanner } from "./index";
import { parseSs } from "./linux";
import { splitHostPort } from "./probe";
import { parseDetails, parseNetstat } from "./windows";

// The parsers below run on fixtures; this runs the real probe of whatever OS the suite is on (CI: Linux).
test("live: the scanner finds this process's own listening socket and its cwd", { skip: !scanner }, async () => {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const { port } = server.address() as AddressInfo;
    const found = (await scanner!.listeners())?.find((l) => l.pid === process.pid && l.port === port);
    assert.ok(found, "listeners() did not report our socket: is ss / netstat / lsof missing or timing out?");
    assert.strictEqual(found.address, "127.0.0.1");
    const mine = (await scanner!.details([process.pid]))?.get(process.pid);
    assert.ok(mine, "details() returns our own pid");
    const real = (p: string) => (process.platform === "linux" ? realpathSync.native(p) : realpathSync.native(p).toLowerCase());
    assert.strictEqual(real(mine.cwd), real(process.cwd()));
    assert.ok(mine.memMb > 0 && mine.startedAt > 0 && mine.startedAt <= Date.now());
  } finally {
    server.close();
  }
});

test("splitHostPort: brackets stripped, * is the IPv4 wildcard, junk rejected", () => {
  assert.deepStrictEqual(splitHostPort("127.0.0.1:3000"), { address: "127.0.0.1", port: 3000 });
  assert.deepStrictEqual(splitHostPort("[::1]:5173"), { address: "::1", port: 5173 });
  assert.deepStrictEqual(splitHostPort("*:8080"), { address: "0.0.0.0", port: 8080 });
  assert.strictEqual(splitHostPort("/Users/me/project"), null);
  assert.strictEqual(splitHostPort("host:0"), null);
});

test("linux: ss rows yield one listener per owning pid", () => {
  const out = [
    "State  Recv-Q Send-Q Local Address:Port Peer Address:Port Process",
    'LISTEN 0      511    0.0.0.0:3000       0.0.0.0:*         users:(("node",pid=42,fd=21),("node",pid=43,fd=21))',
    "LISTEN 0      128    [::]:22            [::]:*",
    'LISTEN 0      511    [::]:5173          [::]:*            users:(("vite",pid=7,fd=3))',
    'LISTEN 0      511    *:8080             *:*               users:(("caddy",pid=9,fd=5))',
  ].join("\n");
  assert.deepStrictEqual(parseSs(out), [
    { pid: 42, name: "node", address: "0.0.0.0", port: 3000 },
    { pid: 43, name: "node", address: "0.0.0.0", port: 3000 },
    { pid: 7, name: "vite", address: "::", port: 5173 },
    { pid: 9, name: "caddy", address: "0.0.0.0", port: 8080 },
  ]);
});

test("windows: netstat keeps listening TCP rows whatever the state's language", () => {
  const out = [
    "Active Connections",
    "",
    "  Proto  Local Address          Foreign Address        State           PID",
    "  TCP    0.0.0.0:135            0.0.0.0:0              LISTENING       1852",
    "  TCP    127.0.0.1:3000         0.0.0.0:0              ABHÖREN         35028",
    "  TCP    [::1]:42050            [::]:0                 LISTENING       31208",
    "  TCP    127.0.0.1:3000         127.0.0.1:51234        ESTABLISHED     35028",
    "  UDP    0.0.0.0:5353           *:*                                    2200",
    "  TCP    0.0.0.0:445            0.0.0.0:0              LISTENING       0",
  ].join("\r\n");
  assert.deepStrictEqual(parseNetstat(out), [
    { pid: 1852, name: "", address: "0.0.0.0", port: 135 },
    { pid: 35028, name: "", address: "127.0.0.1", port: 3000 },
    { pid: 31208, name: "", address: "::1", port: 42050 },
  ]);
});

test("windows: details keep only our session's pids and drop .exe", () => {
  const raw = JSON.stringify({
    session: 1,
    procs: [
      { pid: 35028, session: 1, name: "node.exe", cmd: "node server.js", cwd: "C:\\proj", startedAt: 1700000000000, memMb: 120 },
      { pid: 1852, session: 0, name: "svchost.exe", cmd: "", cwd: "", startedAt: 1, memMb: 9 },
      { pid: "x", session: 1 },
      null,
    ],
  });
  assert.deepStrictEqual([...(parseDetails(raw) ?? [])], [
    [35028, { name: "node", cmd: "node server.js", cwd: "C:\\proj", startedAt: 1700000000000, memMb: 120 }],
  ]);
  assert.strictEqual(parseDetails(""), null);
  assert.strictEqual(parseDetails('{"session":1,"procs":{}}')?.size, 0);
  assert.strictEqual(parseDetails('{"procs":[{"pid":4,"session":0,"name":"System"}]}'), null);
});

test("darwin: lsof listeners and cwds", () => {
  const listeners = ["p501", "cnode", "f23", "n*:3000", "f24", "n[::1]:3001", "p777", "cpython3.12", "f4", "n127.0.0.1:8000"].join("\n");
  assert.deepStrictEqual(parseLsofListeners(listeners), [
    { pid: 501, name: "node", address: "0.0.0.0", port: 3000 },
    { pid: 501, name: "node", address: "::1", port: 3001 },
    { pid: 777, name: "python3.12", address: "127.0.0.1", port: 8000 },
  ]);
  const cwds = ["p501", "fcwd", "n/Users/me/my app", "p777", "fcwd", "n/tmp"].join("\n");
  assert.deepStrictEqual([...parseLsofCwds(cwds)], [[501, "/Users/me/my app"], [777, "/tmp"]]);
});

test("darwin: etime and ps rows", () => {
  assert.strictEqual(parseEtime("05:09"), 309);
  assert.strictEqual(parseEtime("02:00:01"), 7201);
  assert.strictEqual(parseEtime("3-00:00:00"), 3 * 86400);
  const ps = "  501   502  204800      01:40 node /Users/me/app/node_modules/.bin/next dev\n  600     0  1024 01:00 /usr/sbin/sshd\n";
  assert.deepStrictEqual([...parsePs(ps, 502, new Map([[501, "/Users/me/app"]]), 1_000_000)], [
    [501, { name: "", cmd: "node /Users/me/app/node_modules/.bin/next dev", cwd: "/Users/me/app", startedAt: 900_000, memMb: 200 }],
  ]);
});
