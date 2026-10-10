"use client";

import { useCallback, useEffect, useState } from "react";
import { API_ROUTES } from "@agent-office/api-contract";

export type PendingPermission = {
  id: string;
  runId: string;
  tool: string;
  input?: unknown;
  createdAt: number;
};

/**
 * Tool calls parked awaiting the operator's approval for `runId`.
 *
 * Polled rather than driven off the SSE `permission-request` event: a prompt is
 * transient state, not a transcript entry, and polling means a page reload (or a
 * second tab) still sees an outstanding request instead of missing the event.
 * The server denies anything unanswered after its own timeout, so a stale poll
 * resolves itself.
 */
export function usePendingPermissions(runId: string | null, enabled = true) {
  const [pending, setPending] = useState<PendingPermission[]>([]);

  const refresh = useCallback(async () => {
    if (!runId) return setPending([]);
    try {
      const res = await fetch(API_ROUTES.runPermission(runId), { cache: "no-store" });
      if (!res.ok) return;
      const body = (await res.json()) as { pending?: PendingPermission[] };
      setPending(body.pending ?? []);
    } catch {
      // Transient fetch failure — the next tick retries. Never clear on error:
      // dropping a prompt the user has not answered is worse than a stale one.
    }
  }, [runId]);

  useEffect(() => {
    if (!runId || !enabled) { setPending([]); return; }
    void refresh();
    const t = setInterval(() => void refresh(), 2000);
    return () => clearInterval(t);
  }, [runId, enabled, refresh]);

  const decide = useCallback(
    async (id: string, decision: "allow" | "deny") => {
      if (!runId) return;
      // Optimistic: the agent is blocked, so the card must disappear instantly.
      setPending((p) => p.filter((x) => x.id !== id));
      try {
        await fetch(API_ROUTES.runPermission(runId), {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ id, decision }),
        });
      } finally {
        void refresh();
      }
    },
    [runId, refresh],
  );

  return { pending, decide, refresh };
}
