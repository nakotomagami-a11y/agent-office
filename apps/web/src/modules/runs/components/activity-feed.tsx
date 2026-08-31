"use client";

import { useState } from "react";
import { PageHeader } from "@/components/ui/page-header";
import { Icon } from "@/components/ui/icon";
import { Button } from "@/components/ui/button";
import { AnalyticsPage } from "@/modules/analytics/components/analytics-page";
import { useActivityFeed } from "../hooks/use-activity-feed";
import { useAgentUnits } from "../hooks/use-agent-units";
import { ActivityLiveStrip } from "./activity-live-strip";
import { ActivityHaul } from "./activity-haul";
import { ActivityStatTiles } from "./activity-stat-tiles";
import { ActivityHeatmap } from "./activity-heatmap";
import { ActivityLeaderboard } from "./activity-leaderboard";
import { ActivityFilterBar } from "./activity-filter-bar";
import { ActivityScopeTabs } from "./activity-scope-tabs";
import { ActivityScopePill } from "./activity-scope-pill";
import { ActivityViewTabs, type ActivityView } from "./activity-view-tabs";
import { ActivityGroupsList } from "./activity-groups-list";

export type ActivityFeedProps = {
  agentId?: string;
  projectId?: string;
  initialView?: ActivityView;
};

export function ActivityFeed({ agentId, projectId, initialView = "log" }: ActivityFeedProps) {
  const [view, setView] = useState<ActivityView>(initialView);
  const unitByAgent = useAgentUnits();
  const feed = useActivityFeed(agentId, projectId);

  return (
    <>
      <PageHeader
        title="Activity"
        sub={view === "log" ? "campaign log · run by run" : "usage, spend & reliability"}
        actions={
          <>
            <ActivityViewTabs view={view} setView={setView} />
            <ActivityScopePill projectId={projectId} />
            {view === "log" && <ActivityScopeTabs scope={feed.scope} setScope={feed.setScope} />}
            {view === "log" && (
              <Button size="sm" variant="ghost" onClick={feed.handleExport} disabled={feed.filtered.length === 0}>
                <Icon name="copy" size={12} />
                Export
              </Button>
            )}
          </>
        }
      />

      <div className="flex flex-col overflow-y-auto flex-1 min-h-0 px-[24px] pt-[20px] pb-[32px] gap-[16px] [&>*]:shrink-0">
        {view === "insights" ? (
          <AnalyticsPage embedded projectId={projectId} />
        ) : (
          <>
            <ActivityLiveStrip runs={feed.liveRuns} unitByAgent={unitByAgent} />

            <div className="flex flex-wrap gap-[14px] items-stretch">
              <ActivityHaul runs={feed.allRuns} />
              <ActivityStatTiles runs={feed.allRuns} />
            </div>

            <div className="flex flex-wrap gap-[14px] items-stretch">
              <div className="basis-[600px] flex-[3]">
                <ActivityHeatmap runs={feed.allRuns} />
              </div>
              <ActivityLeaderboard runs={feed.allRuns} unitByAgent={unitByAgent} />
            </div>

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
          </>
        )}
      </div>
    </>
  );
}
