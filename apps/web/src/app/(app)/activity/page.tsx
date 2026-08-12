import { ActivityFeed } from "@/modules/runs/components/activity-feed";

type SearchParams = Promise<{ project?: string }>;

export default async function ActivityPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const { project } = await searchParams;
  return <ActivityFeed projectId={project} />;
}
