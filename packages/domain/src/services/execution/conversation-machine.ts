/**
 * Conversation state machine. PURE: no DB, no HTTP, no spawn. Given the state and an action it
 * returns the next state and the effects the caller performs (deliver a message to the agent).
 *
 *   - A user message is ALWAYS delivered at once: the conversation's live process reads it at the
 *     agent's next step, mid-turn or as the next turn (execution/chat-session.ts). Nothing waits.
 *   - Agent Office's own (`system`) messages queue unless the chat is idle with an empty queue, so a
 *     review round never lands in the middle of the user's task. The queue drains one at a time,
 *     only when the process has nothing open, unread or in the background (`idle`).
 *   - A failed turn pauses that queue (`needs_attention`) until the user sends, retries or resumes;
 *     it never blocks the user's own messages.
 *   - A `turnEnded` for anything but the active turn is ignored: a late finish cannot clobber state.
 *
 * See docs/chat-refactor.md.
 */

import type { MessageOrigin } from "../../types/index";

export type ConversationStatus = "idle" | "running" | "needs_attention";

export interface QueuedMessage {
  id: string;
  text: string;
  origin: MessageOrigin;
}

export interface ConversationState {
  status: ConversationStatus;
  /** The turn the agent is on, or null between turns. */
  activeRunId: string | null;
  /** The claude session this conversation resumes. Never shared across conversations. */
  sessionId: string | null;
  /** Prompt of the latest turn — what Retry sends again. */
  lastPrompt: string | null;
  lastOrigin: MessageOrigin;
  /** The latest turn failed: the queue waits for the user. */
  lastFailed: boolean;
  /** Agent Office's own messages waiting for idle, strict FIFO. */
  queue: QueuedMessage[];
}

export type ConversationAction =
  | { type: "send"; message: QueuedMessage }
  | { type: "turnOpened"; runId: string; prompt: string; origin: MessageOrigin }
  | { type: "turnEnded"; runId: string; ok: boolean; sessionId?: string | null }
  /** The process has nothing open, unread or in the background (or is gone). */
  | { type: "idle" }
  | { type: "retry" }
  | { type: "resume" }
  | { type: "removeQueued"; id: string }
  | { type: "clearQueue" };

/** Send a message to the conversation's agent. The caller performs it via the chat session. */
export interface DeliverEffect {
  type: "deliver";
  message: QueuedMessage;
}
export type ConversationEffect = DeliverEffect;

export interface Reduction {
  state: ConversationState;
  effects: ConversationEffect[];
}

/** Prompt used by the "Resume" action on a failed/interrupted turn. */
export const RESUME_PROMPT =
  "Continue the previous task where you left off — the previous run was interrupted before it finished.";

export function initialConversationState(sessionId: string | null = null): ConversationState {
  return { status: "idle", activeRunId: null, sessionId, lastPrompt: null, lastOrigin: "user", lastFailed: false, queue: [] };
}

const noop = (state: ConversationState): Reduction => ({ state, effects: [] });

function deliver(state: ConversationState, message: QueuedMessage): Reduction {
  return { state: { ...state, status: "running" }, effects: [{ type: "deliver", message }] };
}

let nextId = 0;
const freshId = (): string => globalThis.crypto?.randomUUID?.() ?? `m_${Date.now()}_${nextId++}`;

export function reduce(state: ConversationState, action: ConversationAction): Reduction {
  switch (action.type) {
    case "send": {
      if (action.message.origin === "user") return deliver({ ...state, lastFailed: false }, action.message);
      if (state.status === "idle" && state.queue.length === 0) return deliver(state, action.message);
      return noop({ ...state, queue: [...state.queue, action.message] });
    }

    case "turnOpened":
      return noop({ ...state, status: "running", activeRunId: action.runId, lastPrompt: action.prompt, lastOrigin: action.origin });

    case "turnEnded": {
      if (action.runId !== state.activeRunId) return noop(state);
      const sessionId = action.sessionId != null ? action.sessionId : state.sessionId;
      return noop({ ...state, activeRunId: null, sessionId, lastFailed: !action.ok });
    }

    case "idle": {
      // A turn still on the books has not reported its end yet: that report settles the state.
      if (state.status !== "running" || state.activeRunId !== null) return noop(state);
      if (state.lastFailed) return noop({ ...state, status: "needs_attention" });
      const [next, ...rest] = state.queue;
      if (!next) return noop({ ...state, status: "idle" });
      return deliver({ ...state, queue: rest }, next);
    }

    case "retry": {
      if (state.status !== "needs_attention" || state.lastPrompt == null) return noop(state);
      return deliver({ ...state, lastFailed: false }, { id: freshId(), text: state.lastPrompt, origin: state.lastOrigin });
    }

    case "resume": {
      if (state.status !== "needs_attention") return noop(state);
      // The user pressed Resume, so the prompt is genuinely theirs.
      return deliver({ ...state, lastFailed: false }, { id: freshId(), text: RESUME_PROMPT, origin: "user" });
    }

    case "removeQueued":
      return noop({ ...state, queue: state.queue.filter((m) => m.id !== action.id) });

    case "clearQueue":
      return noop({ ...state, queue: [] });
  }
}
