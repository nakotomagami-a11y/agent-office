/**
 * Self-check for the rate_limit_event status → SSE-event mapping. Run against a
 * throwaway HOME (tsx, not bun — bun can't load better-sqlite3's native binding
 * that importing ./runs pulls in):
 *   HOME=$(mktemp -d) npx tsx packages/domain/src/services/runs.rate-limit.test.ts
 *
 * Asserts the early WARNING ("allowed_warning") surfaces distinctly from the
 * hard LIMIT ("rejected"), the benign "allowed" (and missing status) emits no
 * card, and resetsAt / rateLimitType are threaded into the message.
 */
import assert from "node:assert";
import { homedir } from "node:os";

import { buildRateLimitEvent } from "./runs";

const HOME = homedir();
assert(HOME.startsWith("/tmp") || HOME.includes("tmp"), "refusing to run outside a throwaway HOME");

// ── benign / missing → no card ───────────────────────────────────────────────
assert.strictEqual(buildRateLimitEvent({ status: "allowed" }, "r1"), null, "allowed must emit nothing");
assert.strictEqual(buildRateLimitEvent(undefined, "r1"), null, "missing info must emit nothing");
assert.strictEqual(buildRateLimitEvent({}, "r1"), null, "missing status must emit nothing");

// ── approaching → WARNING, run keeps going ───────────────────────────────────
const warn = buildRateLimitEvent({ status: "allowed_warning", rateLimitType: "output_tokens" }, "r1");
assert(warn, "allowed_warning must emit an event");
assert.strictEqual(warn.severity, "warning", "allowed_warning must be severity=warning");
assert.strictEqual(warn.runId, "r1");
assert(/Approaching/.test(warn.message), `warning message should say Approaching, got: ${warn.message}`);
assert(/keep going/.test(warn.message), "warning message should reassure the run continues");
assert(/output_tokens limit/.test(warn.message), "warning message should include rateLimitType");

// ── hard limit → LIMIT ───────────────────────────────────────────────────────
const resetsAt = Math.floor(Date.now() / 1000) + 3600;
const hit = buildRateLimitEvent({ status: "rejected", resetsAt }, "r2");
assert(hit, "rejected must emit an event");
assert.strictEqual(hit.severity, "limit", "rejected must be severity=limit");
assert.strictEqual(hit.resetsAt, resetsAt, "resetsAt must be threaded through");
assert(/Rate limited by Anthropic API/.test(hit.message), `limit message wrong: ${hit.message}`);
assert(/Resets at/.test(hit.message), "limit message should include reset time when resetsAt present");

// ── unknown non-terminal status defaults to WARNING (never mislabel as stopped) ─
const unknown = buildRateLimitEvent({ status: "throttled" }, "r3");
assert(unknown, "unknown non-allowed status must emit an event");
assert.strictEqual(unknown.severity, "warning", "unknown status must default to warning, not limit");

console.log("ok — buildRateLimitEvent status→severity mapping holds");
