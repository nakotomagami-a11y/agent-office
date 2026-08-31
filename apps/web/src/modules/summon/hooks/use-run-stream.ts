"use client";

import { useEffect, useState } from "react";
import {
  INITIAL_STREAM_STATE,
  peekRunStreamState,
  reconnectRunStream,
  subscribeToRunStream,
  type RunStreamState,
} from "../state/run-stream-registry";

export type { ConnectionState, RunStreamState } from "../state/run-stream-registry";

export interface UseRunStreamResult extends RunStreamState {
  /** Force-close the current EventSource and start a new one. No-op when idle. */
  reconnect: () => void;
}

/**
 * Thin React binding over `subscribeToRunStream` in
 * `state/run-stream-registry.ts`.
 *
 * All EventSource lifecycle now lives in the registry so unmounting this
 * component (e.g. switching project tabs) no longer kills the stream — the
 * remounted component just re-subscribes and picks up wherever the tokens
 * currently are. Local `state` mirrors the registry entry so React's render
 * discipline is unchanged.
 */
export function useRunStream(runId: string | null): UseRunStreamResult {
  // Lazy initializer — runs synchronously during the first render, so a run
  // that's already cached as "streaming" (e.g. remounting this ChatPanel
  // while it's genuinely still going) reads correctly from paint one,
  // instead of flashing "idle" until the effect below corrects it a tick
  // later. See `peekRunStreamState`'s doc comment for why that tick mattered.
  const [state, setState] = useState<RunStreamState>(() =>
    runId ? peekRunStreamState(runId) : INITIAL_STREAM_STATE,
  );

  useEffect(() => {
    if (!runId) {
      setState(INITIAL_STREAM_STATE);
      return;
    }
    const unsubscribe = subscribeToRunStream(runId, setState);
    return unsubscribe;
  }, [runId]);

  return {
    ...state,
    reconnect: () => {
      if (runId) reconnectRunStream(runId);
    },
  };
}
