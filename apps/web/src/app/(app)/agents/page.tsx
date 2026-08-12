import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { Icon } from "@/components/ui/icon";
import { PageHeader } from "@/components/ui/page-header";
import { AgentList } from "@/modules/agents/components/agent-list";
import { ACCENT_BTN } from "@/lib/button-styles";
import { PAGE_ROUTES } from "@agent-office/domain/config/routes";

export default async function AgentsPage() {
  const t = await getTranslations();
  return (
    <>
      <PageHeader
        title={t("nav.agents")}
        sub={`· ${t("agent.list_sub")}`}
        actions={
          <Link
            href={PAGE_ROUTES.agentNew}
            className={`inline-flex items-center gap-[6px] ${ACCENT_BTN} font-semibold px-[14px] py-[8px] rounded-[9px] text-[13px] no-underline`}
          >
            <Icon name="plus" size={13} /> {t("office.new_agent")}
          </Link>
        }
      />
      <AgentList />
    </>
  );
}
