/**
 * End-to-end test for the auth-error fix: a claude process that fails to
 * authenticate prints to stderr and exits non-zero *before* streaming any
 * output. This drives startRun → finalizeRun, which must classify the stderr
 * and broadcast an `auth_expired` error (so the UI shows the Sign-in card).
 *
 * Uses a throwaway HOME and a stub `claude` on PATH so it never touches the
 * real environment:
 *   HOME=$(mktemp -d) PATH="<stubdir>:$PATH" npx tsx packages/domain/src/services/runs.auth-e2e.test.ts
 */
import assert from "node:assert";
import { homedir } from "node:os";
import { execSync } from "node:child_process";
import { startRun, attachEmit, type SseEvent } from "./runs";

const HOME = homedir();
assert(HOME.startsWith("/tmp") || HOME.includes("tmp"), "refusing to run outside a throwaway HOME");

// Sanity: the stub claude on PATH must reproduce the real failure shape.
const stubStderr = (() => {
  try {
    execSync("claude -p hi", { stdio: ["ignore", "pipe", "pipe"] });
    return "";
  } catch (e) {
    return String((e as { stderr?: Buffer }).stderr ?? "");
  }
})();
assert(/oauth session expired/i.test(stubStderr), `stub claude must emit the auth error; got: ${stubStderr}`);

const events: SseEvent[] = [];
const { runId } = startRun({
  agentId: "test",
  agentName: "Test",
  prompt: "hi",
  model: "sonnet",
  effort: "high",
  args: ["-p", "hi"],
});
const attached = attachEmit(runId, (e) => {
  events.push(e);
});
assert(attached, "attachEmit should find the freshly started live run");

// Wait for the stub to exit and finalizeRun to fire.
await new Promise((r) => setTimeout(r, 1500));

const authErr = events.find((e) => e.name === "error" && (e.data as { code?: string }).code === "auth_expired");
assert(
  authErr,
  `expected an auth_expired error event; got: ${JSON.stringify(events.map((e) => ({ n: e.name, c: (e.data as { code?: string }).code })))}`,
);
console.log("✓ e2e: auth failure (non-zero exit, stderr-only) → auth_expired error broadcast");
process.exit(0);
