"use client";

// Dev-only harness for eyeballing the loop pill against real rows. Not linked
// from anywhere; `/dev/*` already exists for this purpose.
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@agent-office/domain/hooks/api";
import { LoopPill } from "@/modules/loops/components/loop-pill";

export default function DevLoopPage() {
  const { data: ids } = useQuery({
    queryKey: ["dev", "loop-ids"],
    queryFn: () => apiFetch<string[]>("/api/dev/loop-ids"),
  });
  return (
    <div className="p-8 flex flex-col gap-6">
      <h1 className="text-ao-fg-0 text-lg">Loop pill — real rows</h1>
      {(ids ?? []).map((id) => (
        <div key={id} className="flex items-center gap-3">
          <code className="text-[11px] text-ao-fg-2">{id.slice(0, 8)}</code>
          <LoopPill loopId={id} />
        </div>
      ))}
    </div>
  );
}
