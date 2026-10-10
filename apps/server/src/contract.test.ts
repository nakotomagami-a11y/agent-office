import assert from "node:assert";
import { test } from "node:test";
import { API_ROUTES } from "@agent-office/api-contract";
import { ROUTES } from "./route-table";

// Every route the server serves is addressable through the contract, and every
// contract entry reaches a real route: a client never needs a hand-written path.
const shape = (path: string) =>
  path.split("?")[0]!.split("/").map((s) => (s.includes("__arg") || /^\[.+\]$/.test(s) ? "[*]" : s)).join("/");

function contractPaths(): Map<string, string> {
  const out = new Map<string, string>();
  for (const [name, value] of Object.entries(API_ROUTES)) {
    const path: string = typeof value === "string"
      ? value
      : (value as (...a: string[]) => string)(...Array.from({ length: value.length }, (_, i) => `__arg${i}__`));
    const dup = out.get(shape(path));
    assert.strictEqual(dup, undefined, `API_ROUTES.${name} and .${dup} build the same path`);
    out.set(shape(path), name);
  }
  return out;
}

test("every server route has an API_ROUTES entry", () => {
  const contract = contractPaths();
  const missing = ROUTES.map((r) => r.path).filter((p) => !contract.has(shape(p)));
  assert.deepStrictEqual(missing, [], "add these to packages/api-contract/src/routes.ts");
});

test("every API_ROUTES entry reaches a server route", () => {
  const served = new Set(ROUTES.map((r) => shape(r.path)));
  const stale = [...contractPaths()].filter(([path]) => !served.has(path)).map(([path, name]) => `${name}: ${path}`);
  assert.deepStrictEqual(stale, []);
});
