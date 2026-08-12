import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/ui/page-header";
import { SkillsPage } from "@/modules/skills/components/skills-page";

export default async function SkillsRoute() {
  const t = await getTranslations();
  return (
    <>
      <PageHeader title={t("nav.skills")} sub={t("skills_page.sub")} />
      <SkillsPage />
    </>
  );
}
