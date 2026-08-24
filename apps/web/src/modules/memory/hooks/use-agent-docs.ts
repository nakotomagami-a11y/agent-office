"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@agent-office/domain/hooks/api";
import { queryKeys } from "@agent-office/domain/hooks/query-keys";
import { API_ROUTES } from "@agent-office/domain/config/routes";

// ─── Types ───────────────────────────────────────────────────────────────────
// Doc contracts live in @agent-office/domain/types; the category catalog in
// @agent-office/domain/config/doc-categories. Re-exported so the memory-page
// components can keep importing them from this hook.
import { DOC_CATEGORIES, type DocCategory } from "@agent-office/domain/config/doc-categories";
import type { Doc, DocMeta } from "@agent-office/domain/types";
export { DOC_CATEGORIES };
export type { DocCategory, Doc, DocMeta };

/** Web request body for create/update — owner + slug come from the route. */
export interface UpsertDocInput {
  title: string;
  category: DocCategory;
  body: string;
}

// ─── Hooks ───────────────────────────────────────────────────────────────────

export function useAgentDocs() {
  return useQuery({
    queryKey: queryKeys.agentDocs.list(),
    queryFn: () => apiFetch<DocMeta[]>(API_ROUTES.agentDocs),
  });
}

export function useAgentDoc(owner: string | null, slug: string | null) {
  return useQuery({
    queryKey: queryKeys.agentDocs.detail(owner ?? "__none", slug ?? "__none"),
    queryFn: () => apiFetch<Doc>(API_ROUTES.agentDoc(owner!, slug!)),
    enabled: !!owner && !!slug,
  });
}

export function useUpsertAgentDoc() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { owner: string; slug: string } & UpsertDocInput) =>
      apiFetch<Doc>(API_ROUTES.agentDoc(args.owner, args.slug), {
        method: "PUT",
        body: {
          title: args.title,
          category: args.category,
          body: args.body,
        },
      }),
    onSuccess: (_data, args) => {
      qc.invalidateQueries({ queryKey: queryKeys.agentDocs.list() });
      qc.invalidateQueries({
        queryKey: queryKeys.agentDocs.detail(args.owner, args.slug),
      });
    },
  });
}

export function useDeleteAgentDoc() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { owner: string; slug: string }) =>
      apiFetch<void>(API_ROUTES.agentDoc(args.owner, args.slug), { method: "DELETE" }),
    onSuccess: (_data, args) => {
      qc.invalidateQueries({ queryKey: queryKeys.agentDocs.list() });
      qc.removeQueries({
        queryKey: queryKeys.agentDocs.detail(args.owner, args.slug),
      });
    },
  });
}
