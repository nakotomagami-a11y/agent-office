"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@agent-office/domain/hooks/api";
import { queryKeys } from "@agent-office/domain/hooks/query-keys";
import { API_ROUTES } from "@agent-office/domain/config/routes";
import { Card } from "@/components/ui/card";
import { CardHeader } from "@/components/ui/card-header";
import { QueryState } from "@/components/ui/query-state";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/cn";
import { useAccounts } from "../hooks/use-accounts";

/**
 * Per-account activity rollup. Each account is a row carrying four metric
 * tiles — run counts across three windows plus the 7-day cost, which is
 * accented since it is the number that matters most for routing decisions.
 */

interface AccountStats {
  accountId: string | null;
  runs24h: number;
  runs7d: number;
  runsAllTime: number;
  cost7dUsd: number;
}

export function AccountsStatsPanel() {
  const accountsQ = useAccounts();
  const statsQ = useQuery({
    queryKey: queryKeys.analytics.perAccount(),
    queryFn: () => apiFetch<AccountStats[]>(API_ROUTES.analyticsPerAccount),
    refetchInterval: 30_000,
  });

  const rows = useMemo(() => {
    if (!accountsQ.data || !statsQ.data) return [];
    return accountsQ.data.map((account) => {
      // Legacy rows with NULL account_id belong to the default account.
      const stats =
        statsQ.data.find((s) => s.accountId === account.id) ??
        (account.id === "default"
          ? statsQ.data.find((s) => s.accountId === null)
          : null) ??
        emptyStats(account.id);
      return { account, stats };
    });
  }, [accountsQ.data, statsQ.data]);

  return (
    <Card>
      <CardHeader
        title="Usage per account"
        sub="Runs and 7-day cost grouped by the account that ran them."
      />
      <div className="p-4">
        <QueryState result={statsQ} loading={<div className="text-[12px] text-txt-3">Loading…</div>}>
          {() =>
            rows.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-[10px] py-[28px] text-center">
                <span className="flex items-center justify-center w-[40px] h-[40px] rounded-full bg-bg-2 border border-line text-txt-4">
                  <Icon name="activity" size={18} />
                </span>
                <span className="text-[12.5px] text-txt-3 max-w-[320px]">
                  No runs recorded yet. Usage appears here once an agent runs under an account.
                </span>
              </div>
            ) : (
              <div className="flex flex-col gap-[8px]">
                {rows.map(({ account, stats }) => (
                  <div
                    key={account.id}
                    className="flex items-center gap-[14px] p-[12px] rounded-[10px] bg-bg-2 border border-line"
                  >
                    <Icon name="users" size={16} className="text-txt-3 shrink-0" />
                    <span className="flex-1 min-w-0 text-[13px] font-semibold text-txt truncate">
                      {account.label}
                    </span>
                    <div className="flex items-stretch gap-0 shrink-0">
                      <Metric label="Runs 24h" value={stats.runs24h.toString()} />
                      <Metric label="Runs 7d" value={stats.runs7d.toString()} />
                      <Metric label="All time" value={stats.runsAllTime.toString()} />
                      <Metric label="Cost 7d" value={`$${stats.cost7dUsd.toFixed(2)}`} accent last />
                    </div>
                  </div>
                ))}
              </div>
            )
          }
        </QueryState>
      </div>
    </Card>
  );
}

function Metric({
  label,
  value,
  accent,
  last,
}: {
  label: string;
  value: string;
  accent?: boolean;
  last?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-end justify-center gap-[3px] px-[14px] min-w-[72px]",
        !last && "border-r border-line",
      )}
    >
      <span
        className={cn(
          "font-[var(--font-mono)] text-[14px] leading-none tabular-nums",
          accent ? "text-acc font-semibold" : "text-txt",
        )}
      >
        {value}
      </span>
      <span className="text-[9.5px] font-[var(--font-mono)] uppercase tracking-[0.07em] text-txt-3 leading-none">
        {label}
      </span>
    </div>
  );
}

function emptyStats(accountId: string): AccountStats {
  return { accountId, runs24h: 0, runs7d: 0, runsAllTime: 0, cost7dUsd: 0 };
}
