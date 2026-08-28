import { notFound } from "next/navigation";
import { agents } from "@agent-office/domain/services";
import { AgentEditorForm } from "@/modules/agents/components/agent-editor-form";
import { fromApi } from "@/modules/agents/form/agent-form";

type Params = { params: Promise<{ id: string }> };

export default async function EditAgentPage({ params }: Params) {
  const { id } = await params;
  const found = agents.readAgent(id);
  if (!found) notFound();
  const initial = fromApi(found.info, found.body);
  return <AgentEditorForm mode="edit" initial={initial} />;
}
