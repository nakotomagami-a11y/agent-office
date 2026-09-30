/**
 * The app's ONLY origin check.
 *
 * `proxy.ts` (formerly `middleware.ts`) is the whole of the CSRF defence: the
 * API routes themselves do not check origin. It had no test, so a rename, a
 * matcher typo, or an inverted condition would remove the protection silently
 * and every other check in the repo would still pass.
 *
 *   pnpm --filter @agent-office/web test
 */
import assert from "node:assert";
import { test } from "node:test";
import { proxy } from "./proxy";
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
