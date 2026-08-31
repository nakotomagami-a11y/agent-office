/**
 * How long the stream has been silent before we show the quiet "still
 * connected" note. Agents routinely go silent for a minute+ while thinking or
 * running a long tool, so this is deliberately generous — it's a calm status,
 * not an alarm.
 */
export const STALE_STREAM_THRESHOLD_MS = 150_000;

export type LiveStats = { elapsedSec: number; tokens: number };

/**
 * Live elapsed time + running token count for the still-streaming tail row.
 * Returned as structured numbers, not a pre-joined string — the elapsed
 * counter and the token count render in two different places (an inline
 * stopwatch next to the typing dots, and a ledger-style stat in the right
 * rail), each with its own formatting. Returns `undefined` when the run
 * hasn't started yet (nothing worth showing).
 */
export function deriveLiveStats(input: {
  startTs: number | null;
  isActivePhase: boolean;
  historyTokens: number;
  streamTokensIn: number;
  streamTokensOut: number;
}): LiveStats | undefined {
  if (!input.startTs || !input.isActivePhase) return undefined;
  const elapsedSec = Math.floor((Date.now() - input.startTs) / 1000);
  if (elapsedSec <= 0) return undefined;
  const tokens = input.historyTokens + input.streamTokensIn + input.streamTokensOut;
  return { elapsedSec, tokens };
}

export type StreamStaleness = {
  sinceLastEventMs: number | null;
  isStale: boolean;
};

/**
 * Compute how long since the last stream event and whether that crosses the
 * "stale" threshold. `null` when the caller isn't actively streaming.
 */
export function deriveStreamStaleness(
  lastEventAt: number | null,
  isStreaming: boolean,
): StreamStaleness {
  const sinceLastEventMs = lastEventAt && isStreaming ? Date.now() - lastEventAt : null;
  return {
    sinceLastEventMs,
    isStale: sinceLastEventMs !== null && sinceLastEventMs > STALE_STREAM_THRESHOLD_MS,
  };
}
