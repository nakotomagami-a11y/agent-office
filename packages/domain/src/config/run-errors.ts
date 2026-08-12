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
  "worktree_missing",   // cwd/.worktrees gone → repair
  "claude_unavailable", // claude CLI not installed / not on PATH
  "secret_invalid",     // verify-before-run blocked the spawn
  "unknown_agent",      // agent/instance deleted after scheduling
  "max_runtime",        // exceeded the wall-clock cap
  "spawn_failed",       // OS failed to spawn the claude process
  "no_output",          // run ended with error and no usable output
  "server_restart",     // run lost because the server restarted mid-flight
  "start_failed",       // summon request itself failed before a run started
  "unknown",            // catch-all — `detail` carries the raw context
] as const;

export type RunErrorCode = (typeof RUN_ERROR_CODES)[number];

export function isRunErrorCode(v: unknown): v is RunErrorCode {
  return typeof v === "string" && (RUN_ERROR_CODES as readonly string[]).includes(v);
}
