import { fmtElapsed } from "./phase-format";

/** How long the stream has been silent before we flag it as stale. */
export const STALE_STREAM_THRESHOLD_MS = 90_000;

/**
 * Compute the compact "elapsed · N tok" chip shown next to the running phase.
 * Returns `undefined` when the run hasn't started yet (nothing worth showing).
 */
export function deriveLiveStats(input: {
  startTs: number | null;
  isActivePhase: boolean;
  historyTokens: number;
  streamTokensIn: number;
  streamTokensOut: number;
}): string | undefined {
  if (!input.startTs || !input.isActivePhase) return undefined;
  const elapsedSec = Math.floor((Date.now() - input.startTs) / 1000);
  if (elapsedSec <= 0) return undefined;
  const totalTok = input.historyTokens + input.streamTokensIn + input.streamTokensOut;
  return `${fmtElapsed(elapsedSec)}${totalTok > 0 ? ` · ${totalTok.toLocaleString()} tok` : ""}`;
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
