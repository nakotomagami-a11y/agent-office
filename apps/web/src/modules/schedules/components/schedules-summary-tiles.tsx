import { useMemo } from "react";
import type { ScheduledJob } from "@agent-office/domain/types";
import { whenParts } from "../format/schedule-format";

/**
 * Three summary tiles: Queued / Recurring / Watchers. Queued and Watchers are
 * real — one-shot jobs and rate-limit auto-resumes both already exist in the
 * schedule model. Recurring (cron-style repeats) has no backend yet (see
 * REDESIGN_V3_PLAN §9.3) — the tile is honest about that rather than faking a
 * count.
 */
export function SchedulesSummaryTiles({ jobs }: { jobs: ScheduledJob[] }) {
  const stats = useMemo(() => {
    const queued = jobs.filter((j) => j.status === "pending" || j.status === "firing");
    const nextFire = queued.length > 0 ? Math.min(...queued.map((j) => j.fireAt)) : null;
    const watchers = jobs.filter((j) => j.reason === "rate-limit" && j.status === "pending");
    return { queuedCount: queued.length, nextFire, watcherCount: watchers.length };
  }, [jobs]);

  return (
    <div className="flex flex-wrap gap-[14px]">
      <Tile
        icon="/icons/clock.png"
        label="Queued"
        value={stats.queuedCount}
        unit="orders"
        sub={stats.nextFire ? `next fires ${whenParts(stats.nextFire).rel}` : "nothing queued"}
      />
      <Tile
        icon="/icons/recurring.png"
        label="Recurring"
        value={0}
        unit="active"
        sub="coming soon — one-shot only for now"
        dim
      />
      <Tile
        icon="/icons/eye.png"
        label="Watchers"
        value={stats.watcherCount}
        unit="armed"
        sub="resumes on rate-limit reset"
      />
    </div>
  );
}

function Tile({
  icon,
  label,
  value,
  unit,
  sub,
  dim,
}: {
  icon: string;
  label: string;
  value: number;
  unit: string;
  sub: string;
  dim?: boolean;
}) {
  return (
    <div className="flex-1 min-w-[220px] flex items-center gap-[14px] rounded-[16px] surface-sheen shadow-[var(--lift)] px-[18px] py-[16px]">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={icon} alt="" width={78} height={78} className={dim ? "shrink-0 object-contain opacity-60" : "shrink-0 object-contain"} />
      <div className="min-w-0 flex-1 leading-tight">
        <div className="font-mono text-[9.5px] font-extrabold tracking-[0.09em] uppercase text-txt-4 truncate">{label}</div>
        <div className={dim ? "mt-[4px] opacity-60" : "mt-[4px]"}>
          <span className="font-extrabold text-txt text-[22px] tracking-[-0.02em]">{value}</span>{" "}
          <span className="text-txt-3 text-[12.5px]">{unit}</span>
        </div>
        <div className="mt-[3px] font-mono text-[10.5px] text-txt-4 truncate">{sub}</div>
      </div>
    </div>
  );
}
