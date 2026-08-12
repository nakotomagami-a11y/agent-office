"use client";

import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@agent-office/domain/hooks/api";
import { queryKeys } from "@agent-office/domain/hooks/query-keys";
import { API_ROUTES } from "@agent-office/domain/config/routes";

/**
 * A saved / recent prompt entry.
 *
 * The API returns raw `string[]`; we derive a short title from the first line
 * of each string so the slash-menu can display a heading + preview.
 */
export interface AgentPrompt {
  /** Derived from the first line (≤60 chars) of the raw string. */
  title: string;
  /** Full prompt text - replaces the composer value on selection. */
  body: string;
}

function toAgentPrompts(raw: string[]): AgentPrompt[] {
  return raw.map((s) => {
    const firstLine = s.split("\n")[0]?.trim() ?? s;
    const title = firstLine.length > 60 ? firstLine.slice(0, 57) + "…" : firstLine;
    return { title, body: s };
  });
}

export function useAgentPrompts(agentId: string | null | undefined) {
  return useQuery({
    queryKey: queryKeys.agents.prompts(agentId ?? "__none"),
    queryFn: () => apiFetch<string[]>(API_ROUTES.agentPrompts(agentId!)),
    enabled: !!agentId,
    select: toAgentPrompts,
  });
}
