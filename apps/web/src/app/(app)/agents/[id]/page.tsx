import { getTranslations } from "next-intl/server";
import { AgentDetail } from "@/modules/agents/components/agent-detail";

type Params = { params: Promise<{ id: string }> };

export default async function AgentPage({ params }: Params) {
  const { id } = await params;
  const t = await getTranslations();
  return (
    <>
      <div className="flex items-center gap-[10px] px-[18px] py-[10px] border-b border-line bg-bg-1">
        <h1 className="m-0 text-[16px] font-bold tracking-[-0.01em]">{t("agent.title_view")}</h1>
        <span className="text-[12px] text-txt-3 font-[var(--font-mono)]">· {id}</span>
      </div>
      <AgentDetail id={id} />
    </>
  );
}
