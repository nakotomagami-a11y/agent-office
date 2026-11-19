// The chat processes alive in this server and who listens to them. State only, on `globalThis` so
// an HMR reload keeps the processes it already started: chat-session.ts owns the behaviour, and
// summon-run.ts reads it here without importing that module (it imports summon-run).

import type { MessageOrigin } from "../../types/index";

export type SessionEvent =
  /** `inputId`: the message the turn opened on; null when the CLI started it on its own. */
  | { type: "turnOpened"; convId: string; runId: string; prompt: string; origin: MessageOrigin; inputId: string | null }
  /** The agent read a message while turn `runId` was running. */
  | { type: "inputRead"; convId: string; runId: string; inputId: string }
  /** The process got busy again (background work started, a message is waiting). */
  | { type: "changed"; convId: string }
  /** Nothing open, unread or running in the background. */
  | { type: "idle"; convId: string }
  /** `unreadIds`: what this process was sent and never read; a successor may already hold others. */
  | { type: "exited"; convId: string; sessionId: string | null; unreadIds: string[] };

export type SessionListener = (event: SessionEvent) => void;

interface Registry {
  map: Map<string, unknown>;
  listeners: Set<SessionListener>;
  /** Set by chat-session.ts when it loads; until then no chat process exists to make way. */
  releaseIdleSeat: (agentId: string, instanceId: string | undefined) => Promise<boolean>;
  /** A chat process on this instance has a turn open, a message unread or background work. */
  instanceBusy: (instanceId: string) => boolean;
  /** Kill the instance's idle chat processes now: its worktree is about to go, and Windows will
   *  not delete a folder that is a live process's working directory. */
  stopIdleInstance: (instanceId: string) => void;
}

declare global {
  var __agentOfficeChatSessions: Registry | undefined;
}

export const chatSessions: Registry =
  globalThis.__agentOfficeChatSessions ??
  (globalThis.__agentOfficeChatSessions = {
    map: new Map(),
    listeners: new Set(),
    releaseIdleSeat: () => Promise.resolve(true),
    instanceBusy: () => false,
    stopIdleInstance: () => {},
  });

/** One seat, however a caller spells the default instance. */
export function seatKey(agentId: string, instanceId: string | undefined): string {
  return `${agentId}::${instanceId ?? "default"}`;
}
