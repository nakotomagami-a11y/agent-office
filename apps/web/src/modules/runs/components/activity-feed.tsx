"use client";

import { PageHeader } from "@/components/ui/page-header";
import { Icon } from "@/components/ui/icon";
import { Button } from "@/components/ui/button";
import { useActivityFeed } from "../hooks/use-activity-feed";
import { useAgentUnits } from "../hooks/use-agent-units";
import { ActivityLiveStrip } from "./activity-live-strip";
import { ActivityStatTiles } from "./activity-stat-tiles";
import { ActivityHeatmap } from "./activity-heatmap";
import { ActivityFilterBar } from "./activity-filter-bar";
import { ActivityScopeTabs } from "./activity-scope-tabs";
import { ActivityGroupsList } from "./activity-groups-list";

export type ActivityFeedProps = {
  agentId?: string;
  projectId?: string;
};

export function ActivityFeed({ agentId, projectId }: ActivityFeedProps) {
  const unitByAgent = useAgentUnits();
  const feed = useActivityFeed(agentId, projectId);

  return (
    <>
      <PageHeader
        title="Activity"
        sub={projectId ? "· run history for this project" : "· run history across all agents"}
        actions={
          <>
            <ActivityScopeTabs scope={feed.scope} setScope={feed.setScope} />
            <Button size="sm" variant="ghost" onClick={feed.handleExport} disabled={feed.filtered.length === 0}>
              <Icon name="copy" size={12} />
              Export
            </Button>
          </>
        }
      />

      <div className="flex flex-col overflow-y-auto flex-1 min-h-0 px-[24px] pt-[20px] pb-[32px] gap-[20px]">
        <ActivityLiveStrip runs={feed.liveRuns} unitByAgent={unitByAgent} />
        <ActivityStatTiles runs={feed.allRuns} />
        <ActivityHeatmap runs={feed.allRuns} />
        <ActivityFilterBar filters={feed.filters} setFilters={feed.setFilters} />

        <ActivityGroupsList
          groups={feed.groups}
          isLoading={feed.isLoading}
          expandedDays={feed.expandedDays}
          toggleDay={feed.toggleDay}
          openId={feed.openId}
          toggleOpen={feed.toggleOpen}
          maxCost={feed.maxCost}
          unitByAgent={unitByAgent}
        />
      </div>
    </>
  );
}
