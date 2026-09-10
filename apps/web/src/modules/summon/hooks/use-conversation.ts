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
 * Polling: an idle conversation with an empty queue never polls (its state
 * only ever changes in response to THIS client's own actions, which already
 * invalidate the query). A running/needs_attention/queued conversation polls
 * lightly — the auto-advance driver lives in the SERVER (finalizeRun), so the
 * moment a run finishes the server may already have started the next queued
 * turn before this client's next poll; polling is what picks that up (the
 * live SSE stream for the CURRENT run is unaffected and unpolled — see
 * use-conversation-chat-model.ts).
 */
export function useConversation(agentId: string, instanceId: string | undefined) {
  const slot = instanceId && instanceId.length > 0 ? instanceId : "default";
  return useQuery({
    queryKey: queryKeys.conversations.bySlot(agentId, slot),
    queryFn: () =>
      apiFetch<ConversationView | null>(
        `${API_ROUTES.conversations}?agentId=${encodeURIComponent(agentId)}&instanceId=${encodeURIComponent(slot)}`,
      ),
    refetchInterval: (query) => {
      const data = query.state.data;
      if (!data) return false;
      return data.status !== "idle" || data.queue.length > 0 ? POLL.CONVERSATION_ACTIVE : false;
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
