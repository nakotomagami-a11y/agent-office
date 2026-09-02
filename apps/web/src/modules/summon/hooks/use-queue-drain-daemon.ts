"use client";

import { useEffect, useRef } from "react";
import { isRunErrorCode } from "@agent-office/domain/config/run-errors";
import { ApiError } from "@/lib/api-client";
import { useSummon } from "./use-summon";
import { useChatStateRegistry, type ChatStateEntry } from "../state/chat-state-registry";
import { subscribeToRunStream, type RunStreamState } from "../state/run-stream-registry";
import type { ThreadItem } from "../format/thread-types";

const TERMINAL_PHASES: ReadonlySet<RunStreamState["phase"]> = new Set(["done", "error"]);

/**
 * Keeps queued messages moving even when the tKey's `ChatPanel` isn't
 * mounted. Only one `ChatPanel` renders at a time (whichever agent/project
 * is currently open — see `office-view.tsx`), and the queue used to drain
 * exclusively via `useQueueDrain` inside `useChatActions`, which only exists
 * while that panel is mounted. So a message queued behind a long-running
 * task on project A sat frozen the moment the user switched to project B,
 * and only continued once they navigated back to A (remounting the panel
 * re-evaluates the drain effect against the now-stale-but-correct phase).
 *
 * Fix: run the same "drain on run completion" logic from a component that's
 * always mounted (see `AppLayout`), driven entirely by the two global,
 * mount-independent stores that already exist for exactly this reason — the
 * per-tKey `chat-state-registry` and the per-run `run-stream-registry`
 * (EventSource survives a ChatPanel unmount by design; see that file's
 * header comment). This hook doesn't duplicate their state, it just
 * subscribes to both and fires the next queued send when a run they track
 * reaches a terminal phase.
 */
export function useQueueDrainDaemon(): void {
  const summon = useSummon();
  const mutateRef = useRef(summon.mutate);
  mutateRef.current = summon.mutate;

  useEffect(() => {
    // tKey -> unsubscribe from that tKey's active run stream.
    const streamSubs = new Map<string, () => void>();

    const drain = (tKey: string, sessionIdFromStream: string | null) => {
      const { entries, patchEntry } = useChatStateRegistry.getState();
      const entry = entries[tKey];
      if (!entry || entry.queuedMessages.length === 0 || !entry.agentId) return;
      const next = entry.queuedMessages[0]!;
      const userItem: ThreadItem = { kind: "you", id: `y_${Date.now()}`, text: next.text };
      const sessionId = sessionIdFromStream ?? entry.sessionId;
      patchEntry(tKey, {
        queuedMessages: entry.queuedMessages.slice(1),
        thread: [...entry.thread, userItem],
        activeRunId: null,
        phaseOverride: "sending",
        sessionId,
      });
      mutateRef.current(
        {
          agentId: entry.agentId,
          prompt: next.text,
          projectId: entry.projectId ?? undefined,
          instanceId: entry.instanceId ?? undefined,
          resumeSessionId: sessionId ?? undefined,
          contextProfile: entry.contextProfile,
        },
        {
          // `useSummon`'s hook-level onSuccess/onError (use-summon.ts) already
          // writes the new activeRunId / clears phaseOverride straight into
          // the registry regardless of who called `.mutate()` — that part
          // doesn't need duplicating here. This per-call `onError` only
          // covers the two things that hook-level callback can't: undoing
          // the optimistic "you" bubble + putting the message back on the
          // queue for an `already_running` race, and surfacing a real
          // failure as a system-error card instead of the message just
          // silently vanishing. Mirrors the visible-panel path in
          // `use-chat-actions.ts`'s `makeDoSubmit`.
          onError: (err) => {
            const rawCode = err instanceof ApiError ? err.message : undefined;
            const code = isRunErrorCode(rawCode) ? rawCode : "start_failed";
            const { entries: latest, patchEntry: patch } = useChatStateRegistry.getState();
            const current = latest[tKey];
            if (!current) return;
            if (code === "already_running") {
              patch(tKey, {
                thread: current.thread.filter((it) => it.id !== userItem.id),
                queuedMessages: [{ id: `q_${Date.now()}_retry`, text: next.text }, ...current.queuedMessages],
              });
              return;
            }
            const detail =
              (err instanceof ApiError && typeof err.data?.detail === "string" ? err.data.detail : undefined) ??
              (code === "start_failed" && err instanceof Error ? err.message : undefined);
            patch(tKey, {
              thread: [...current.thread, { kind: "system-error", id: `e_${Date.now()}`, code, detail }],
            });
          },
        },
      );
    };

    // Re-subscribes to run streams as the registry changes. A tKey is
    // "pending" once it has a queued message; while it also has an
    // activeRunId we wait for that run to finish before draining, otherwise
    // (a queue/run-clear race) drain immediately, guarded by phaseOverride
    // so a send already in flight doesn't get double-fired.
    //
    // `drain` calls `patchEntry`, which notifies this same subscription
    // synchronously (Zustand isn't batched) — so `reconcile` can re-enter
    // itself mid-loop, e.g. when `subscribeToRunStream` synchronously
    // replays an already-terminal cached state on subscribe. The
    // running/dirty guard below flattens that reentrancy into a plain loop
    // instead of an interleaved nested call over a now-stale `entries`
    // snapshot.
    let running = false;
    let dirty = false;
    const reconcileOnce = () => {
      const entries = useChatStateRegistry.getState().entries;
      const seen = new Set<string>();

      for (const [tKey, entry] of Object.entries(entries) as Array<[string, ChatStateEntry]>) {
        if (entry.queuedMessages.length === 0) continue;

        if (entry.activeRunId) {
          seen.add(tKey);
          if (streamSubs.has(tKey)) continue;
          const runId = entry.activeRunId;
          const unsub = subscribeToRunStream(runId, (state) => {
            if (!TERMINAL_PHASES.has(state.phase)) return;
            streamSubs.get(tKey)?.();
            streamSubs.delete(tKey);
            drain(tKey, state.sessionId);
          });
          streamSubs.set(tKey, unsub);
        } else if (entry.phaseOverride !== "sending") {
          drain(tKey, null);
        }
      }

      // Drop subscriptions for tKeys that no longer have a queue (drained,
      // or the queue was cleared e.g. by Stop).
      for (const [tKey, unsub] of streamSubs) {
        if (!seen.has(tKey)) {
          unsub();
          streamSubs.delete(tKey);
        }
      }
    };
    const reconcile = () => {
      if (running) { dirty = true; return; }
      running = true;
      do {
        dirty = false;
        reconcileOnce();
      } while (dirty);
      running = false;
    };

    reconcile();
    const unsubscribeStore = useChatStateRegistry.subscribe(reconcile);
    return () => {
      unsubscribeStore();
      for (const unsub of streamSubs.values()) unsub();
      streamSubs.clear();
    };
  }, []);
}
