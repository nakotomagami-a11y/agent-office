"use client";

import { useMemo } from "react";
import { useRuns } from "@/modules/runs/hooks/use-runs";

export function useSearchRuns(query: string) {
  const { data, isLoading } = useRuns({ limit: 500 });
  const results = useMemo(() => {
    if (!query.trim()) return data ?? [];
    const q = query.toLowerCase();
    return (data ?? []).filter(
      (r) => r.prompt.toLowerCase().includes(q) || r.output.toLowerCase().includes(q),
    );
  }, [data, query]);
  return { results, isLoading };
}
