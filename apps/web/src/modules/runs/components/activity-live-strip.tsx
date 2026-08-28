import type { PersistedRun } from "@agent-office/domain/types";
import type { UnitSelection } from "@/components/ui/unit-sprite-registry";
import { useIntervalTick } from "../hooks/use-interval-tick";
import { ActivityLiveRunRow } from "./activity-live-run-row";

export function ActivityLiveStrip({
  runs,
  unitByAgent,
}: {
  runs: PersistedRun[];
  unitByAgent: Map<string, UnitSelection>;
}) {
  useIntervalTick(runs.length > 0);
  if (runs.length === 0) return null;
  return (
    <section className="flex flex-col gap-[8px]">
      <div className="flex items-center uppercase text-txt-4 gap-[10px] font-mono text-[10.5px] tracking-[0.1em]">
        <span className="shrink-0 relative rounded-full w-[7px] h-[7px] bg-green after:content-[''] after:absolute after:inset-[-4px] after:rounded-full after:border after:border-green after:opacity-50 after:animate-[act-ping_1.6s_ease-out_infinite]" />
        Live now
        <span className="bg-card-2 text-txt-2 rounded-full normal-case px-[8px] py-[1px] tracking-[0]">{runs.length}</span>
        <span className="flex-1" />
        <span className="normal-case tracking-normal">updating live</span>
      </div>
      {runs.map((r) => (
        <ActivityLiveRunRow key={r.id} run={r} unitByAgent={unitByAgent} />
      ))}
    </section>
  );
}
