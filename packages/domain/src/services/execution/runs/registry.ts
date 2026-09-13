// The live-run registry: the process-wide singleton of in-flight runs, plus
// the completion-listener set. State only — spawning, streaming, and
// finalize live in runs.ts. Split out so reads (queries.ts) don't have to
// pull in the whole spawn machine.
//
// Both structures hang off `globalThis` to survive Next.js HMR reloads in
// dev — otherwise an edit anywhere in runs.ts's dependency graph would swap
// in a fresh empty Map, orphaning every in-flight run.

import type { LiveRun } from "./types";

/** `(runId, ok, sessionId)` — dispatched by `finalizeRun` for every
 *  conversation-tagged run. A plain callback registry, not a direct import
 *  of the conversation service, to avoid an import cycle through
 *  summon-run.ts (which already imports runs.ts). */
export type RunFinishedListener = (runId: string, ok: boolean, sessionId: string | null) => void;

declare global {
  var __agentOfficeLiveRuns: Map<string, LiveRun> | undefined;
  var __agentOfficeRunFinishedListeners: Set<RunFinishedListener> | undefined;
}

export const liveRuns: Map<string, LiveRun> =
  globalThis.__agentOfficeLiveRuns ??
  (globalThis.__agentOfficeLiveRuns = new Map());

export const runFinishedListeners: Set<RunFinishedListener> =
  globalThis.__agentOfficeRunFinishedListeners ??
  (globalThis.__agentOfficeRunFinishedListeners = new Set());

/** Subscribe to run completions. Returns an unsubscribe function (unused by
 *  the one production wiring callsite, which registers for the process
 *  lifetime, but kept for symmetry and tests). */
export function registerRunFinishedListener(fn: RunFinishedListener): () => void {
  runFinishedListeners.add(fn);
  return () => runFinishedListeners.delete(fn);
}

export function getLiveRun(runId: string): LiveRun | undefined {
  return liveRuns.get(runId);
}
