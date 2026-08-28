import { useMemo } from "react";
import type { ScheduledJob } from "@agent-office/domain/types";
import { Icon } from "@/components/ui/icon";
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
        icon="clock"
        color="var(--acc)"
        label="Queued"
        value={stats.queuedCount}
        unit="orders"
        sub={stats.nextFire ? `next fires ${whenParts(stats.nextFire).rel}` : "nothing queued"}
      />
      <Tile
        icon="refresh"
        color="var(--cyan)"
        label="Recurring"
        value={0}
        unit="active"
        sub="coming soon — one-shot only for now"
        dim
      />
      <Tile
        icon="eye"
        color="var(--amber)"
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
  color,
  label,
  value,
  unit,
  sub,
  dim,
}: {
  icon: "clock" | "refresh" | "eye";
  color: string;
  label: string;
  value: number;
  unit: string;
  sub: string;
  dim?: boolean;
}) {
  return (
    <div className="flex-1 min-w-[220px] flex flex-col gap-[10px] rounded-[16px] surface-sheen shadow-[var(--lift)] px-[18px] py-[16px]">
      <div className="flex items-center gap-[9px]">
        <div
          className="flex items-center justify-center w-[30px] h-[30px] rounded-[9px] shrink-0"
          style={{ background: `color-mix(in oklab, ${color} 16%, transparent)`, color }}
        >
          <Icon name={icon} size={15} />
        </div>
        <span className="font-mono text-[9.5px] font-extrabold tracking-[0.09em] uppercase text-txt-4">{label}</span>
      </div>
      <div className={dim ? "opacity-60" : ""}>
        <span className="font-extrabold text-txt text-[24px] tracking-[-0.02em]">{value}</span>{" "}
        <span className="text-txt-3 text-[13px]">{unit}</span>
      </div>
      <div className="font-mono text-[10.5px] text-txt-4">{sub}</div>
    </div>
  );
}
