import { useMemo } from "react";
import type { PersistedRun } from "@agent-office/domain/types";
import { buildStatTiles } from "../derive/activity-tiles";
import { ActivityStatTile } from "./activity-stat-tile";

export function ActivityStatTiles({ runs }: { runs: PersistedRun[] }) {
  const tiles = useMemo(() => buildStatTiles(runs), [runs]);
  return (
    <div className="flex flex-wrap gap-[12px] [&>*]:basis-[calc(25%-9px)] max-[1024px]:[&>*]:basis-[calc(50%-6px)] max-[600px]:[&>*]:basis-full">
      {tiles.map((t) => (
        <ActivityStatTile key={t.label} tile={t} />
      ))}
    </div>
  );
}
