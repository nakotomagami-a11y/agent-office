/**
 * Machine-readable run-failure codes. FE and BE only ever exchange a code (+
 * optional short `detail`); the UI maps the code to localized copy and the
 * right recovery affordance. Never put transcript text in an error — that's
 * what `detail` (capped) is for, if anything.
 *
 * These live in their own runtime module (not `types/index.ts`) so the client
 * can `import { isRunErrorCode }` without tripping the Next transpile-package
 * trap where a previously type-only module caches as an empty runtime module.
 */
export const RUN_ERROR_CODES = [
  "stopped",            // user hit Stop — neutral, not a failure
  "auth_expired",       // Claude session/credentials invalid → sign in
  "subscription_disabled", // org/subscription access revoked → check account
  "worktree_missing",   // cwd/.worktrees gone → repair
  "claude_unavailable", // claude CLI not installed / not on PATH
  "secret_invalid",     // verify-before-run blocked the spawn
  "seat_cap_reached",   // a mission seat has spent its cap on this device
  "unknown_agent",      // agent/instance deleted after scheduling
  "max_runtime",        // exceeded the wall-clock cap
  "spawn_failed",       // OS failed to spawn the claude process
  "already_running",    // target already has a live run — client requeues, doesn't error out
  "no_output",          // run ended with error and no usable output
  "server_restart",     // run lost because the server restarted mid-flight
  "start_failed",       // summon request itself failed before a run started
  "provider_unavailable", // the chosen AI provider cannot run; `detail` is its status reason
  "provider_auth_failed", // the provider rejected the stored key
  "provider_unreachable", // the provider, local server or gateway upstream is down
  "provider_model_not_found", // the mapped model does not exist on the provider
  "provider_mismatch",  // the CLI authenticated another way than the chosen provider
  "budget_exceeded",    // the gateway stopped a capped openai run at its cap
  "unknown",            // catch-all — `detail` carries the raw context
] as const;

export type RunErrorCode = (typeof RUN_ERROR_CODES)[number];

export function isRunErrorCode(v: unknown): v is RunErrorCode {
  return typeof v === "string" && (RUN_ERROR_CODES as readonly string[]).includes(v);
}

/**
 * RULE errors.machine-codes — what an AGENT should do about each failure.
 * The code is for the client (i18n); this is for the agent, so a failure
 * teaches its own fix instead of needing the rule resident up front.
 */
export const RUN_ERROR_REMEDIATION: Record<RunErrorCode, string> = {
  stopped: "The user halted this run deliberately. Do not retry; wait for new instructions.",
  auth_expired: "Claude credentials are invalid. The user must sign in again — do not retry, and never attempt to re-authenticate yourself.",
  subscription_disabled: "Account access was revoked. Surface this to the user; retrying cannot succeed.",
  worktree_missing: "The instance's worktree is gone. Repair it from the roster before running again; do not fall back to the shared project directory.",
  claude_unavailable: "The `claude` CLI is not installed or not on PATH. Report it — this is an environment problem, not a task problem.",
  secret_invalid: "A linked secret failed verification, so the spawn was blocked. The user must fix the secret; never print or guess its value.",
  seat_cap_reached: "This mission seat has spent its cap on this device. The user raises it in the mission panel; do not retry until they do.",
  unknown_agent: "The target agent or instance no longer exists. Reassign the work or cancel it.",
  max_runtime: "The wall-clock cap was hit. Split the task into smaller steps rather than retrying it whole.",
  spawn_failed: "The OS refused to start the process. Check cwd and PATH before retrying.",
  already_running: "That instance already has a live run. Queue the message instead of starting a second one.",
  no_output: "The run ended with an error and produced nothing usable. Check stderr; do not report partial success.",
  server_restart: "The server restarted mid-run, so this run was lost. It is safe to retry.",
  start_failed: "The summon request itself failed before a run existed. Validate the request before retrying.",
  provider_unavailable: "The chosen AI provider cannot run (`detail` says why). The user fixes it in Settings → AI provider; never switch providers yourself.",
  provider_auth_failed: "The AI provider rejected its key. The user replaces the key in Settings → AI provider; signing in to Claude will not help.",
  provider_unreachable: "The AI provider could not be reached. Check that the local server or the network is up before retrying.",
  provider_model_not_found: "The model this agent maps to does not exist on the provider. The user fixes the model map in Settings → AI provider.",
  provider_mismatch: "The CLI used a different credential than the chosen provider, so the run was stopped. Report it; do not retry.",
  budget_exceeded: "The run spent its budget cap (or its model lost its price), so the gateway stopped it. Report what is done; the user raises the cap before more work.",
  unknown: "Unclassified failure — read `detail` for raw context before deciding anything.",
};

/** Codes that end a run without it failing — rendered as a neutral pause, not a red error. */
export function isInterruptionCode(code: RunErrorCode): boolean {
  return code === "stopped" || code === "server_restart";
}

/** Agent-facing fix for a code, or undefined when the code is unknown. */
export function remediationFor(code: string): string | undefined {
  return isRunErrorCode(code) ? RUN_ERROR_REMEDIATION[code] : undefined;
}

