"use client";

import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@agent-office/domain/hooks/api";
import { Icon } from "@/components/ui/icon";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";

export type HistoryEntry = {
  filename: string;
  ts: number;
  sizeBytes: number;
};

type Props = {
  agentId: string;
  onRestore: (body: string) => void;
};

export function BodyHistoryPanel({ agentId, onRestore }: Props) {
  const historyQ = useQuery({
    queryKey: ["agents", "body-history", agentId],
    queryFn: () =>
      apiFetch<HistoryEntry[]>(`/api/agents/${encodeURIComponent(agentId)}/body/history`),
  });

  const entries = historyQ.data ?? [];

  const handleRestore = async (entry: HistoryEntry) => {
    try {
      const content = await apiFetch<string>(
        `/api/agents/${encodeURIComponent(agentId)}/body/history/${encodeURIComponent(entry.filename)}`,
        { asText: true },
      );
      onRestore(content);
    } catch {
      // surface nothing - the parent form will stay unchanged
    }
  };

  if (historyQ.isLoading) {
    return (
      <div className="p-4">
        <Skeleton width="100%" height={120} />
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div className="px-4 py-6 text-center text-[13px] text-[var(--txt-3)]">
        No saved versions yet.
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      {entries.map((entry) => {
        const date = new Date(entry.ts).toLocaleString(undefined, {
          dateStyle: "medium",
          timeStyle: "short",
        });
        const kb = (entry.sizeBytes / 1024).toFixed(1);
        return (
          <div
            key={entry.filename}
            className="flex items-center gap-3 px-4 py-[10px] border-b border-[var(--line)]"
          >
            <div className="flex-1 min-w-0">
              <div className="text-[13px] font-medium">
                Saved {date}
              </div>
              <div className="text-[11px] text-[var(--txt-3)] font-[var(--font-mono)] mt-[2px]">
                {kb} KB · {entry.filename}
              </div>
            </div>
            <Button
              size="sm"
              onClick={() => handleRestore(entry)}
              title={`Restore version saved ${date}`}
            >
              <Icon name="refresh" />
              Restore
            </Button>
          </div>
        );
      })}
    </div>
  );
}
