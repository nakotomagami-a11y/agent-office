/**
 * Connects the run engine and the chat processes to the conversation service: a turn's end comes
 * from the run engine's finish listeners, a turn's start, idle and exit from the chat process.
 * The ONLY place either drives a conversation.
 *
 * Kept apart from `runs.ts` (which must not import this file, `conversation.ts` or `summon-run.ts`:
 * `summon-run.ts` already imports `runs.ts`), which only exposes a callback registry.
 *
 * Installed by `installRunListeners` (run-listeners.ts), which every server's `boot()` calls
 * before it serves runs.
 */
import { registerRunFinishedListener } from "./runs";
import { onRunFinished, onSessionEvent } from "./conversation";
import { onSessionEvent as onChatSessionEvent, killAllSessions } from "./chat-session";
import { productionConversationRunner } from "./conversation-runner";
import { log } from "../infra/log";

declare global {
  // HMR-safety: a re-run of this module would register a second listener into sets that survive
  // HMR on `globalThis`, and every turn's end would then be processed twice.
  var __agentOfficeConversationWiringInstalled: boolean | undefined;
}

export function installConversationWiring(): void {
  if (globalThis.__agentOfficeConversationWiringInstalled) return;
  registerRunFinishedListener((runId, ok, sessionId) => {
    void onRunFinished(runId, ok, sessionId, productionConversationRunner).catch((err) => {
      log.error("conversation.on_run_finished_failed", { runId, err: String(err) });
    });
  });
  onChatSessionEvent((event) => {
    void onSessionEvent(event, productionConversationRunner).catch((err) => {
      log.error("conversation.on_session_event_failed", { convId: event.convId, type: event.type, err: String(err) });
    });
  });
  // `exit` too: the standalone server's own signal handlers call process.exit before these run.
  // A chat process left alive would still read what is in its stdin pipe, which the next start sends again.
  for (const signal of ["SIGINT", "SIGTERM"] as const) process.on(signal, () => killAllSessions());
  process.on("exit", () => killAllSessions());
  globalThis.__agentOfficeConversationWiringInstalled = true;
}
