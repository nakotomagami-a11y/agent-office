"use client";

import type { ReactNode } from "react";
import type { UseQueryResult } from "@tanstack/react-query";

export type QueryStateProps<T> = {
  /** react-query result (from `useQuery`). */
  result: UseQueryResult<T, unknown>;
  /** Render function for the success path. */
  children: (data: T) => ReactNode;
  /** Loading state. Skeletons live here; keep them scoped to dynamic parts. */
  loading?: ReactNode;
  /** Error state. Defaults to a small red inline card. */
  error?: (err: unknown) => ReactNode;
  /**
   * Predicate that decides whether the fetched `data` is empty. Defaults to
   * `Array.isArray(data) && data.length === 0` — override for object shapes.
   */
  isEmpty?: (data: T) => boolean;
  /** Empty state — shown when `isEmpty(data)` returns true. */
  empty?: ReactNode;
};

/**
 * Ships one canonical way to render every fetching page: match the query
 * lifecycle with `ts-pattern` and branch into loading / error / empty /
 * success. Enforces the house-standard state ordering + prevents partial
 * renders (e.g. showing an empty state while still loading).
 *
 * Usage:
 * ```tsx
 * <QueryState result={agentsQ} loading={<AgentListGhost />} empty={<EmptyState … />}>
 *   {(agents) => <AgentGrid items={agents} />}
 * </QueryState>
 * ```
 *
 * The generic keeps the success child fully typed.
 */
export function QueryState<T>({
  result,
  children,
  loading,
  error,
  isEmpty,
  empty,
}: QueryStateProps<T>) {
  if (result.isPending) return <>{loading ?? <DefaultLoading />}</>;
  if (result.isError) return <>{error ? error(result.error) : <DefaultError err={result.error} />}</>;
  const data = result.data as T;
  const isEmptyFn = isEmpty ?? defaultIsEmpty<T>;
  if (isEmptyFn(data)) return <>{empty ?? null}</>;
  return <>{children(data)}</>;
}

function defaultIsEmpty<T>(data: T): boolean {
  if (data === null || data === undefined) return true;
  if (Array.isArray(data) && data.length === 0) return true;
  return false;
}

function DefaultLoading() {
  return (
    <div className="text-txt-3 text-[13px] font-mono px-4 py-6">Loading…</div>
  );
}

function DefaultError({ err }: { err: unknown }) {
  const msg = err instanceof Error ? err.message : String(err);
  return (
    <div
      role="alert"
      className="mx-4 my-2 px-3 py-2 rounded-md text-[12.5px] border border-[color-mix(in_oklch,var(--error)_35%,transparent)] bg-[color-mix(in_oklch,var(--error)_8%,transparent)] text-[var(--error)]"
    >
      {msg}
    </div>
  );
}
