"use client";

import { useEffect } from "react";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { API_ROUTES } from "@agent-office/domain/config/routes";
import { queryKeys } from "@agent-office/domain/hooks/query-keys";

/** One app-wide `EventSource` on `/api/events`. Maps each coarse domain event
 *  to a React Query invalidation, replacing per-hook `refetchInterval` polling
 *  for server-driven state. External-world watchers keep their own short
 *  polls — see `services/infra/events.ts`. Invalidation is by key prefix, so
 *  `["runs"]` refreshes lists/trees/details in one go. */
const HANDLERS: Record<string, (qc: QueryClient) => void> = {
  "runs:changed": (qc) => {
    void qc.invalidateQueries({ queryKey: queryKeys.runs.all });
    // Office agent statuses AND the Context & Cost tab derive from runs, so
    // invalidate the whole `agents` subtree — those views then update instantly
    // over SSE instead of via their own short refetchInterval polls.
    void qc.invalidateQueries({ queryKey: queryKeys.agents.all });
  },
  "spend:changed": (qc) => {
    void qc.invalidateQueries({ queryKey: ["projects", "spend"] });
  },
  "conversations:changed": (qc) => {
    void qc.invalidateQueries({ queryKey: queryKeys.conversations.all });
  },
  "schedules:changed": (qc) => {
    void qc.invalidateQueries({ queryKey: ["schedules"] });
  },
};

export function AppEvents() {
  const qc = useQueryClient();

  useEffect(() => {
    const source = new EventSource(API_ROUTES.events);
    const listeners: Array<[string, EventListener]> = [];

    for (const type of Object.keys(HANDLERS)) {
      const listener: EventListener = () => HANDLERS[type]!(qc);
      source.addEventListener(type, listener);
      listeners.push([type, listener]);
    }

    return () => {
      for (const [type, listener] of listeners) source.removeEventListener(type, listener);
      source.close();
    };
  }, [qc]);

  return null;
}
