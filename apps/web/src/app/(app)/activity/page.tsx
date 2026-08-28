import { ActivityFeed } from "@/modules/runs/components/activity-feed";

type SearchParams = Promise<{ project?: string; tab?: string }>;

export default async function ActivityPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const { project, tab } = await searchParams;
  return <ActivityFeed projectId={project} initialView={tab === "insights" ? "insights" : "log"} />;
}
