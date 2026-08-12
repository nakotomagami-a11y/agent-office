"use client";

import { useEffect, useState } from "react";

/**
 * Ticks once per second while a run is in flight, forcing a re-render so
 * "Xs since last token" style displays stay accurate without waiting for
 * stream events.
 *
 * Returns nothing — the caller doesn't need the tick value, just the
 * re-render side-effect. The counter is kept local so consumers don't
 * accidentally list it as a dependency.
 */
export function useStreamingTick(input: {
  activeRunId: string | null;
  streamPhase: "idle" | "starting" | "streaming" | "done" | "error";
}): void {
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!input.activeRunId) return;
    if (input.streamPhase === "done" || input.streamPhase === "error") return;
    const id = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [input.activeRunId, input.streamPhase]);
}
