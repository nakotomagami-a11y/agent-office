"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { RunRow } from "@/modules/runs/components/run-row";
import { useSearchRuns } from "../hooks/use-search-runs";

export function SearchView() {
  const t = useTranslations();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [query, setQuery] = useState(() => searchParams.get("q") ?? "");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { results, isLoading } = useSearchRuns(query);

  const handleChange = useCallback(
    (value: string) => {
      setQuery(value);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        const params = new URLSearchParams(searchParams.toString());
        if (value.trim()) {
          params.set("q", value);
        } else {
          params.delete("q");
        }
        router.replace(`/search?${params.toString()}`);
      }, 300);
    },
    [router, searchParams],
  );

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  return (
    <div className="overflow-auto py-[18px] px-6 flex flex-col gap-3">
      <div className="flex gap-2 items-center">
        <input
          autoFocus
          type="search"
          value={query}
          onChange={(e) => handleChange(e.target.value)}
          placeholder={t("search_page.placeholder")}
          aria-label={t("search_page.placeholder")}
          className="flex-1 bg-bg-1 border border-line rounded-[var(--r-md)] px-3 py-[7px] font-[var(--font-mono)] text-[13px] text-txt outline-none"
        />
      </div>

      {isLoading ? (
        <div className="flex flex-col gap-1">
          <Skeleton width="100%" height={48} />
          <Skeleton width="100%" height={48} />
          <Skeleton width="100%" height={48} />
        </div>
      ) : results.length === 0 ? (
        <EmptyState
          icon="search"
          title={t("search_page.no_results_title")}
          description={t("search_page.no_results_desc")}
        />
      ) : (
        <div>
          <div className="font-[var(--font-mono)] text-[11px] text-txt-3 px-[2px] pb-2">
            {t("search_page.results_count", { count: results.length })}
          </div>
          <div className="border border-line rounded-[var(--r-md)] overflow-hidden">
            {results.map((run) => (
              <RunRow key={run.id} run={run} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
