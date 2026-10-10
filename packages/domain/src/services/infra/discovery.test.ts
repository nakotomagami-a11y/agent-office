/**
 * The Minecraft mod (and the permission bridge) reach this server only through
 * appBaseUrl and the servers/<pid>.json entries, so the URL must follow the bound
 * port, every entry must be complete JSON, and no server may hide another.
 *
 *   pnpm --filter @agent-office/domain test src/services/infra/discovery.test.ts
 */
import assert from "node:assert";
import { mkdirSync, mkdtempSync, readdirSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import {
  appBaseUrl,
  discoveryFile,
  isLiveServer,
  pruneDeadServers,
  readDiscoveryFiles,
  removeDiscoveryFile,
  SERVER_STALE_MS,
  writeDiscoveryFile,
} from "./discovery";

const freshDir = () => join(mkdtempSync(join(tmpdir(), "discovery-")), "servers");

test("an explicit AO_BASE_URL wins over PORT", () => {
  assert.equal(appBaseUrl({ AO_BASE_URL: "http://127.0.0.1:9999", PORT: "4000" }), "http://127.0.0.1:9999");
});

test("PORT is used on loopback when AO_BASE_URL is unset", () => {
  assert.equal(appBaseUrl({ PORT: "51234" }), "http://127.0.0.1:51234");
});

test("defaults to port 3000", () => {
  assert.equal(appBaseUrl({}), "http://127.0.0.1:3000");
});

test("each server writes its own <pid>.json and creates the directory", () => {
  const dir = freshDir();
  const info = writeDiscoveryFile(dir, { baseUrl: "http://127.0.0.1:51234", pid: 42, startedAt: 1000 });
  assert.deepEqual(info, { baseUrl: "http://127.0.0.1:51234", pid: 42, startedAt: 1000 });
  assert.deepEqual(readdirSync(dir), ["42.json"]);
  assert.deepEqual(readDiscoveryFiles(dir), [info]);
});

test("defaults come from this process", () => {
  const before = Date.now();
  const info = writeDiscoveryFile(freshDir());
  assert.equal(info.baseUrl, appBaseUrl());
  assert.equal(info.pid, process.pid);
  assert.ok(info.startedAt >= before && info.startedAt <= Date.now());
});

test("a dev server starting and stopping never hides the desktop app", () => {
  const dir = freshDir();
  writeDiscoveryFile(dir, { baseUrl: "http://127.0.0.1:57456", pid: 100, startedAt: 1 });
  writeDiscoveryFile(dir, { baseUrl: "http://127.0.0.1:3000", pid: 200, startedAt: 2 });
  assert.deepEqual(readDiscoveryFiles(dir).map((s) => s.baseUrl), ["http://127.0.0.1:3000", "http://127.0.0.1:57456"]);
  removeDiscoveryFile(dir, 200);
  assert.deepEqual(readDiscoveryFiles(dir).map((s) => s.baseUrl), ["http://127.0.0.1:57456"]);
  removeDiscoveryFile(dir, 200); // already gone: not an error
});

test("entries of killed servers are pruned at boot, live ones and this process kept", () => {
  const dir = freshDir();
  writeDiscoveryFile(dir, { baseUrl: "http://127.0.0.1:1", pid: 11, startedAt: 1 });
  writeDiscoveryFile(dir, { baseUrl: "http://127.0.0.1:2", pid: 22, startedAt: 2 });
  writeDiscoveryFile(dir, { baseUrl: "http://127.0.0.1:3", pid: process.pid, startedAt: 3 });
  assert.equal(pruneDeadServers(dir, (pid) => pid === 22), 1);
  assert.deepEqual(readdirSync(dir).sort(), ["22.json", `${process.pid}.json`].sort());
});

test("malformed entries are skipped, not fatal", () => {
  const dir = freshDir();
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "1.json"), "{not json");
  writeFileSync(join(dir, "2.json"), JSON.stringify({ baseUrl: 5, pid: 2, startedAt: 2 }));
  writeDiscoveryFile(dir, { baseUrl: "http://127.0.0.1:3000", pid: 3, startedAt: 3 });
  assert.deepEqual(readDiscoveryFiles(dir).map((s) => s.pid), [3]);
  assert.deepEqual(readDiscoveryFiles(join(dir, "missing")), []);
});

test("a server is live while its entry is fresh, and dead once stale even if its pid was reused", () => {
  const dir = freshDir();
  writeDiscoveryFile(dir, { baseUrl: "http://127.0.0.1:1", pid: 4242, startedAt: 1 });
  const alive = () => true;
  const now = Date.now();
  assert.equal(isLiveServer(4242, dir, now, alive, now), true);
  const old = (now - SERVER_STALE_MS - 1000) / 1000;
  utimesSync(discoveryFile(dir, 4242), old, old);
  assert.equal(isLiveServer(4242, dir, now, alive, now), false, "crashed server, pid now someone else's");
  writeDiscoveryFile(dir, { baseUrl: "http://127.0.0.1:1", pid: 4242, startedAt: 1 });
  assert.equal(isLiveServer(4242, dir, Date.now(), () => false, Date.now()), false, "fresh entry, process gone");
});

test("without an entry (an older server, or a failed write) the pid's liveness decides", () => {
  const dir = freshDir();
  assert.equal(isLiveServer(4343, dir, Date.now(), () => true), true);
  assert.equal(isLiveServer(4343, dir, Date.now(), () => false), false);
  assert.equal(isLiveServer(null, dir), false);
  assert.equal(isLiveServer(process.pid, dir, Date.now(), () => false), true, "this process is always live");
});

test("while this server's own beat is late (just woke from sleep), a stale entry is not judged dead", () => {
  const dir = freshDir();
  writeDiscoveryFile(dir, { baseUrl: "http://127.0.0.1:1", pid: 4444, startedAt: 1 });
  const now = Date.now();
  const old = (now - SERVER_STALE_MS - 1000) / 1000;
  utimesSync(discoveryFile(dir, 4444), old, old);
  assert.equal(isLiveServer(4444, dir, now, () => true, now - SERVER_STALE_MS), true);
});
