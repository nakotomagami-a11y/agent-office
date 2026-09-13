"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@agent-office/domain/hooks/api";
import { queryKeys } from "@agent-office/domain/hooks/query-keys";
import { API_ROUTES } from "@agent-office/domain/config/routes";
import type { ContextProfile, ConversationView } from "@agent-office/domain/types";
import { POLL } from "@/lib/polling";

/**
 * Data layer for the server-authoritative conversation (see
 * docs/chat-refactor.md). Replaces the old client transcript blob + queue
 * daemon entirely — the server is the single source of truth for turns,
 * queue, session, and status; this hook just reads and mutates it.
 *
 * Freshness is SSE-driven (see the `refetchInterval` comment below); this
 * hook's own polling is only a slow fallback. The live stream for the
 * CURRENT run's output is a separate, unpolled mechanism — see
 * use-conversation-chat-model.ts.
 */
export function useConversation(agentId: string, instanceId: string | undefined) {
  const slot = instanceId && instanceId.length > 0 ? instanceId : "default";
  return useQuery({
    queryKey: queryKeys.conversations.bySlot(agentId, slot),
    queryFn: () =>
      apiFetch<ConversationView | null>(
        `${API_ROUTES.conversations}?agentId=${encodeURIComponent(agentId)}&instanceId=${encodeURIComponent(slot)}`,
      ),
    // Transitions arrive instantly via the app-wide SSE "conversations:changed"
    // event (app-events.tsx). While a conversation is active/queued, keep a slow
    // reconnect safety net; an idle conversation doesn't poll at all.
    refetchInterval: (query) => {
      const data = query.state.data;
      if (!data) return false;
      return data.status !== "idle" || data.queue.length > 0 ? POLL.SAFETY_NET : false;
    },
  });
}

/** Ensure a conversation exists for the slot (creates one idle if absent). */
export function useEnsureConversation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { agentId: string; instanceId?: string; projectId?: string }) =>
      apiFetch<ConversationView>(API_ROUTES.conversations, { method: "POST", body: args }),
    onSuccess: (data, vars) => {
      const slot = vars.instanceId && vars.instanceId.length > 0 ? vars.instanceId : "default";
      qc.setQueryData(queryKeys.conversations.bySlot(vars.agentId, slot), data);
    },
  });
}

/** Shared invalidation for every conversation-id-scoped mutation below —
 *  refresh both the by-id and by-slot caches for this conversation. */
function useConversationInvalidate() {
  const qc = useQueryClient();
  return (view: ConversationView) => {
    qc.setQueryData(queryKeys.conversations.detail(view.id), view);
    qc.setQueryData(queryKeys.conversations.bySlot(view.agentId, view.instanceId), view);
  };
}

export function useSendConversationMessage() {
  const setView = useConversationInvalidate();
  return useMutation({
    mutationFn: (args: { conversationId: string; text: string; contextProfile?: ContextProfile }) =>
      apiFetch<ConversationView>(API_ROUTES.conversationMessages(args.conversationId), {
        method: "POST",
        body: { text: args.text, contextProfile: args.contextProfile },
      }),
    onSuccess: setView,
  });
}

export function useRetryConversation() {
  const setView = useConversationInvalidate();
  return useMutation({
    mutationFn: (conversationId: string) => apiFetch<ConversationView>(API_ROUTES.conversationRetry(conversationId), { method: "POST" }),
    onSuccess: setView,
  });
}

export function useResumeConversation() {
  const setView = useConversationInvalidate();
  return useMutation({
    mutationFn: (conversationId: string) => apiFetch<ConversationView>(API_ROUTES.conversationResume(conversationId), { method: "POST" }),
    onSuccess: setView,
  });
}

export function useSkipConversation() {
  const setView = useConversationInvalidate();
  return useMutation({
    mutationFn: (conversationId: string) => apiFetch<ConversationView>(API_ROUTES.conversationSkip(conversationId), { method: "POST" }),
    onSuccess: setView,
  });
}

export function useNewConversationThread() {
  const setView = useConversationInvalidate();
  return useMutation({
    mutationFn: (conversationId: string) => apiFetch<ConversationView>(API_ROUTES.conversationNew(conversationId), { method: "POST" }),
    onSuccess: setView,
  });
}

export function useRemoveQueuedMessage() {
  const setView = useConversationInvalidate();
  return useMutation({
    mutationFn: (args: { conversationId: string; messageId: string }) =>
      apiFetch<ConversationView>(API_ROUTES.conversationQueueItem(args.conversationId, args.messageId), { method: "DELETE" }),
    onSuccess: setView,
  });
}

export function useClearConversationQueue() {
  const setView = useConversationInvalidate();
  return useMutation({
    mutationFn: (conversationId: string) => apiFetch<ConversationView>(API_ROUTES.conversationQueue(conversationId), { method: "DELETE" }),
    onSuccess: setView,
  });
}
