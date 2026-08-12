import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { agents } from "@agent-office/domain/services";
import { AgentForm } from "@/modules/agents/components/agent-form";
import { fromApi } from "@/modules/agents/form/agent-form";

type Params = { params: Promise<{ id: string }> };

export default async function EditAgentPage({ params }: Params) {
  const { id } = await params;
  const found = agents.readAgent(id);
  if (!found) notFound();
  const t = await getTranslations();
  const initial = fromApi(found.info, found.body);
  return (
    <>
      <div className="flex items-center gap-[10px] px-[18px] py-[10px] border-b border-line bg-bg-1">
        <h1 className="m-0 text-[16px] font-bold tracking-[-0.01em]">{t("agent.title_edit")}</h1>
        <span className="text-[12px] text-txt-3 font-[var(--font-mono)]">· {id}</span>
      </div>
      <AgentForm initial={initial} mode="edit" />
    </>
  );
}
