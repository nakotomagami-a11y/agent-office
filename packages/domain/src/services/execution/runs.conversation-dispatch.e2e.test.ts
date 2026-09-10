/**
 * End-to-end test for the Step-3 wiring: `finalizeRun` must dispatch every
 * registered `RunFinishedListener` for a top-level turn tagged with a
 * `conversationId` (carrying the real exit outcome + sessionId), and must
 * NEVER dispatch for a run with no conversationId (sub-agent runs, legacy
 * callers). This is `registerRunFinishedListener` tested against a REAL
 * spawned process, not a mock — the actual risk surface added to runs.ts.
 *
 * Deliberately does NOT import conversation-wiring.ts — this test is scoped
 * to runs.ts's own dispatch mechanism. conversation-wiring.ts's own logic
 * (onRunFinished + the production runner) is covered by conversation.test.ts
 * (fake runner) and conversation-runner.test.ts (pure mapping).
 *
 * Same throwaway-HOME + stub-claude-on-PATH technique as runs.auth-e2e.test.ts
 * (required so buildAugmentedPath()'s nvm-bin auto-injection can't find the
 * REAL claude ahead of the stub):
 *   HOME=$(mktemp -d) PATH="<stubdir>:$PATH" npx tsx packages/domain/src/services/execution/runs.conversation-dispatch.e2e.test.ts
 */
import assert from "node:assert";
import { homedir } from "node:os";
import { execSync } from "node:child_process";
import { startRun, registerRunFinishedListener } from "./runs";

const HOME = homedir();
assert(HOME.startsWith("/tmp") || HOME.includes("tmp"), "refusing to run outside a throwaway HOME");

// Sanity: whichever `claude` PATH resolves to must be OUR stub, not the real
// nvm-installed CLI (this is the whole point of the throwaway HOME — it
// starves buildAugmentedPath()'s nvm-bin auto-injection).
const which = execSync("command -v claude").toString().trim();
assert(!which.includes(".nvm"), `expected the stub claude, resolved to the real nvm-installed one: ${which}`);

type Dispatch = { runId: string; ok: boolean; sessionId: string | null };
const dispatches: Dispatch[] = [];
registerRunFinishedListener((runId, ok, sessionId) => {
  dispatches.push({ runId, ok, sessionId });
});

// ── Case 1: success + conversationId → dispatched with ok=true, real sessionId ──
const ok1 = startRun({
  agentId: "test", agentName: "Test", prompt: "hi", model: "sonnet", effort: "high",
  args: ["-p", "hi"], conversationId: "conv-success",
});
await new Promise((r) => setTimeout(r, 1200));
const d1 = dispatches.find((d) => d.runId === ok1.runId);
assert(d1, `expected a dispatch for the successful run; got: ${JSON.stringify(dispatches)}`);
assert.equal(d1!.ok, true);
assert.equal(d1!.sessionId, "stub-session-42");
console.log("✓ success run with conversationId dispatches ok=true + sessionId");

// ── Case 2: failure + conversationId → dispatched with ok=false, sessionId null ──
const ok2 = startRun({
  agentId: "test", agentName: "Test", prompt: "fail-please", model: "sonnet", effort: "high",
  args: ["-p", "fail-please"], conversationId: "conv-fail",
});
await new Promise((r) => setTimeout(r, 1200));
const d2 = dispatches.find((d) => d.runId === ok2.runId);
assert(d2, `expected a dispatch for the failed run; got: ${JSON.stringify(dispatches)}`);
assert.equal(d2!.ok, false);
assert.equal(d2!.sessionId, null);
console.log("✓ failed run with conversationId dispatches ok=false, sessionId null");

// ── Case 3: no conversationId → never dispatched, regardless of outcome ────────
const ok3 = startRun({
  agentId: "test", agentName: "Test", prompt: "hi", model: "sonnet", effort: "high",
  args: ["-p", "hi"], // no conversationId
});
await new Promise((r) => setTimeout(r, 1200));
const d3 = dispatches.find((d) => d.runId === ok3.runId);
assert.equal(d3, undefined, `a run with no conversationId must never dispatch; got: ${JSON.stringify(d3)}`);
console.log("✓ run with no conversationId is never dispatched");

console.log("\n3 passed");
process.exit(0);
