import assert from "node:assert";
import { test } from "node:test";
import Database from "better-sqlite3";
import { createSchema } from "../db/migrations";
import { deviceId, deviceSlug } from "./device";

const mem = new Database(":memory:");
createSchema(mem);
globalThis.__agentOfficeDb = mem;

test("the id is stable across calls and fits the envelope's device pattern", () => {
  const first = deviceId();
  assert.strictEqual(deviceId(), first);
  assert.match(first, /^[a-z0-9-]{1,64}$/);
});

test("hostnames become safe slugs", () => {
  assert.strictEqual(deviceSlug("MeiLi's MacBook-Air.local", "7f3a2b"), "meili-s-macbook-air-local-7f3a2b");
  assert.strictEqual(deviceSlug("ДОМ", "000001"), "device-000001");
  assert.ok(deviceSlug("x".repeat(200), "abcdef").length <= 64);
});
