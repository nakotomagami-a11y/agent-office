"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@agent-office/domain/hooks/api";
import { queryKeys } from "@agent-office/domain/hooks/query-keys";
import { API_ROUTES } from "@agent-office/domain/config/routes";

// ─── Types ───────────────────────────────────────────────────────────────────
// Kept local because these types are only consumed on the memory page. If a
// second reader shows up, promote to `@agent-office/domain/types`.

export const DOC_CATEGORIES = [
  "architecture",
  "plan",
  "notes",
  "postmortem",
  "context",
  "reference",
] as const;

export type DocCategory = (typeof DOC_CATEGORIES)[number];

export interface DocMeta {
  owner: string;
  slug: string;
  title: string;
  category: DocCategory;
  created: string;
  updated: string;
}

export interface Doc extends DocMeta {
  body: string;
}

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
