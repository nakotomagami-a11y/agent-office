/**
 * Closes the loop `runs.ts`'s background-shell tracking leaves open: a
 * `run_in_background` Bash call started by an agent is a real OS process the
 * agent's own `claude` turn does NOT wait for — the turn (and its process)
 * can end while the shell is still running. When that shell later exits, the
 * agent process that started it is long gone; nothing tells the user (or the
 * agent) it finished. Symptom the user hit directly: "install the app and
 * tell me when it's done" → the install kept running via `nohup`, finished
 * fine, but the agent's own turn had already ended, so nobody ever reported
 * back.
 *
 * This is a tiny poll loop, same shape as `scheduler.ts`'s tick: every few
 * seconds, check every tracked `background_shells` row for a PID that has
 * died. For each one whose *owning run has also already finished* (so we
 * never interrupt a still-live turn — Claude's own in-session BashOutput
 * polling handles that case natively), send a follow-up message into that
 * exact conversation via the same `conversation.sendMessage` path the chat
 * UI's "reply" box uses. That either resumes the agent immediately (if idle)
 * or queues behind whatever it's doing next — either way, a real reply shows
 * up in the transcript without the user lifting a finger.
 */
import * as db from "../db";
import { log } from "../infra/log";
import { sendMessage } from "./conversation";
import { productionConversationRunner } from "./conversation-runner";

const TICK_MS = 5_000; // matches the "Shell running" pill's own /api/processes poll

declare global {
  var __agentOfficeBackgroundShellWatcherTimer: ReturnType<typeof setInterval> | undefined;
}

/** The nudge sent back into the conversation once a tracked shell has died. */
export function buildWakeMessage(row: db.BackgroundShellRow): string {
  const label = row.description ? `${row.description} (\`${row.command}\`)` : `\`${row.command}\``;
  return [
    `[background task finished] The backgrounded shell you started — ${label} — is no longer running.`,
    "Check its result (log output, files changed, exit status) and report back to the user.",
  ].join("\n");
}

/** True if `row`'s shell is dead AND the run that started it has already
 *  finished — the only case nothing else in the system will report on. A
 *  still-running owning run means the agent is still in-turn and Claude's
 *  own BashOutput polling is the live, better-informed path; don't race it. */
function shouldWake(row: db.BackgroundShellRow): boolean {
  if (db.isPidAlive(row.pid)) return false;
  const run = db.getRun(row.runId);
  return run?.status !== "running";
}

let ticking = false;
async function tick(): Promise<void> {
  if (ticking) return;
  ticking = true;
  try {
    for (const row of db.listBackgroundShells()) {
      if (!shouldWake(row)) continue;
      // Consumed unconditionally (even if the send below fails) — never
      // fire twice for the same shell, same "own it or drop it" rule
      // `collectBackgroundShells` already applies to a dead PID.
      db.deleteBackgroundShell(row.id);
      try {
        await sendMessage(row.agentId, row.instanceId ?? "default", row.projectId, buildWakeMessage(row), productionConversationRunner);
        log.info("background_shell.wake_sent", { pid: row.pid, agentId: row.agentId, instanceId: row.instanceId });
      } catch (err) {
        log.warn("background_shell.wake_failed", { pid: row.pid, agentId: row.agentId, err: String(err) });
      }
    }
  } catch (err) {
    log.warn("background_shell_watcher.tick_error", { message: err instanceof Error ? err.message : String(err) });
  } finally {
    ticking = false;
  }
}

/** Start the server-side watcher loop. Idempotent (survives HMR restarts) —
 *  same pattern as `scheduler.startScheduler`. */
export function startBackgroundShellWatcher(): void {
  if (globalThis.__agentOfficeBackgroundShellWatcherTimer) return;
  const timer = setInterval(() => { void tick(); }, TICK_MS);
  timer.unref();
  globalThis.__agentOfficeBackgroundShellWatcherTimer = timer;
  log.info("background_shell_watcher.started", { tickMs: TICK_MS });
}
