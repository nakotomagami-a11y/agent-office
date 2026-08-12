import { ProjectDetail } from "@/modules/projects/components/project-detail";

type Params = { params: Promise<{ id: string }> };

export default async function ProjectRoute({ params }: Params) {
  const { id } = await params;
  return <ProjectDetail id={id} />;
}
