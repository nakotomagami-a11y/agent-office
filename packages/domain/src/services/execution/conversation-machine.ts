/**
 * Conversation state machine — the reliability core of the chat refactor.
 *
 * PURE. No DB, no HTTP, no `claude` spawn. Given the current conversation
 * state and an action, it returns the next state plus a list of `effects`
 * (side effects the caller must perform, e.g. "start a run"). This is where
 * every chat reliability bug lived, so it's isolated and unit-tested here
 * before any wiring exists:
 *
 *   - a FAILED / interrupted turn NEVER auto-advances the queue and NEVER
 *     silently resumes an old session (the "it re-ran an old task and skipped
 *     my queued message" bug);
 *   - the queue is a strict FIFO drained by exactly ONE transition
 *     (`runFinished { ok:true }`), so there is no double-drain / out-of-order
 *     race;
 *   - a `runFinished` for anything other than the active run is ignored, so a
 *     late finish from a superseded run can't clobber state;
 *   - the queue is PRESERVED across a failure and across Retry/Resume — only
 *     `clearQueue` / a new conversation drops it.
 *
 * See docs/chat-refactor.md for the full design.
 */

export type ConversationStatus = "idle" | "running" | "needs_attention";

export interface QueuedMessage {
  id: string;
  text: string;
}

export interface ConversationState {
  status: ConversationStatus;
  /** The run currently streaming, or null in the brief "starting" window
   *  between emitting a `startRun` effect and the `runStarted` action. */
  activeRunId: string | null;
  /** The claude `--resume` session for THIS conversation. Null before the
   *  first successful turn. Never shared across conversations/instances. */
  sessionId: string | null;
  /** Prompt of the running/most-recent turn — what `retry` re-runs. */
  lastPrompt: string | null;
  /** Pending user messages, strict FIFO. */
  queue: QueuedMessage[];
}

export type ConversationAction =
  | { type: "send"; message: QueuedMessage }
  | { type: "runStarted"; runId: string }
  | { type: "runFinished"; runId: string; ok: boolean; sessionId?: string | null }
  | { type: "retry" }
  | { type: "resume" }
  | { type: "skip" }
  | { type: "removeQueued"; id: string }
  | { type: "clearQueue" };

/** The single side effect the machine can request: spawn a run. The caller
 *  performs it (via the run engine) and then dispatches `runStarted`. */
export interface StartRunEffect {
  type: "startRun";
  prompt: string;
  resumeSessionId: string | null;
}
export type ConversationEffect = StartRunEffect;

export interface Reduction {
  state: ConversationState;
  effects: ConversationEffect[];
}

/** Prompt used by the "Resume" action on a failed/interrupted turn. */
export const RESUME_PROMPT =
  "Continue the previous task where you left off — the previous run was interrupted before it finished.";

export function initialConversationState(sessionId: string | null = null): ConversationState {
  return { status: "idle", activeRunId: null, sessionId, lastPrompt: null, queue: [] };
}

const noop = (state: ConversationState): Reduction => ({ state, effects: [] });

/** Begin a run for `prompt`: enter `running`, clear activeRunId until
 *  `runStarted`, remember the prompt for a later Retry. */
function begin(state: ConversationState, prompt: string): Reduction {
  return {
    state: { ...state, status: "running", activeRunId: null, lastPrompt: prompt },
    effects: [{ type: "startRun", prompt, resumeSessionId: state.sessionId }],
  };
}

/** After a successful turn (or a Skip): drain the next queued message, or go
 *  idle when the queue is empty. The ONLY place the queue advances. */
function advance(state: ConversationState): Reduction {
  const [next, ...rest] = state.queue;
  if (!next) {
    return { state: { ...state, status: "idle", activeRunId: null }, effects: [] };
  }
  return {
    state: { ...state, status: "running", activeRunId: null, lastPrompt: next.text, queue: rest },
    effects: [{ type: "startRun", prompt: next.text, resumeSessionId: state.sessionId }],
  };
}

export function reduce(state: ConversationState, action: ConversationAction): Reduction {
  switch (action.type) {
    case "send": {
      // Idle → start immediately. Otherwise (running or needs_attention) the
      // message waits in the queue; it never starts a second concurrent run,
      // and it is never lost while a failed turn is unresolved.
      if (state.status === "idle") return begin(state, action.message.text);
      return noop({ ...state, queue: [...state.queue, action.message] });
    }

    case "runStarted": {
      if (state.status !== "running") return noop(state);
      return noop({ ...state, activeRunId: action.runId });
    }

    case "runFinished": {
      // A finish from a superseded/foreign run must not touch state — this is
      // the guard against a late finish clobbering a newer turn.
      if (action.runId !== state.activeRunId) return noop(state);
      const sessionId = action.sessionId != null ? action.sessionId : state.sessionId;
      const withSession = { ...state, sessionId };
      if (action.ok) return advance(withSession);
      // Failure / interrupt / rate-limit: pause. Queue is preserved EXACTLY.
      return noop({ ...withSession, status: "needs_attention", activeRunId: null });
    }

    case "retry": {
      if (state.status !== "needs_attention" || state.lastPrompt == null) return noop(state);
      return begin(state, state.lastPrompt);
    }

    case "resume": {
      if (state.status !== "needs_attention") return noop(state);
      return begin(state, RESUME_PROMPT);
    }

    case "skip": {
      // Discard the failed turn (its run already lives in the runs log) and
      // advance to the next queued message.
      if (state.status !== "needs_attention") return noop(state);
      return advance(state);
    }

    case "removeQueued":
      return noop({ ...state, queue: state.queue.filter((m) => m.id !== action.id) });

    case "clearQueue":
      return noop({ ...state, queue: [] });
  }
}
