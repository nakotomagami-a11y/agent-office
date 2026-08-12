"use client";

import { useState, useMemo } from "react";
import { useTranslations } from "next-intl";
import { Card } from "@/components/ui/card";
import { CardHeader } from "@/components/ui/card-header";
import { TextInput } from "@/components/ui/text-input";
import { Checkbox } from "@/components/ui/checkbox";
import { Tag } from "@/components/ui/tag";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { WeaponIcon } from "@/components/ui/weapon-icon";
import {
  useInstallSkill,
  useRegistry,
  useUninstallSkill,
  useSkillIcons,
  useSetSkillIcon,
  skillIconKey,
  skillIconConfig,
  type SkillIconMap,
} from "../hooks/use-skills";
import { filterRegistry, type RegistryFilter } from "../registry/filter-registry";
import type { RegistrySkill } from "@agent-office/domain/types";
import { SkillSourcesCard } from "./skill-sources-card";
import { WeaponIconModal } from "./weapon-icon-modal";

export function SkillsPage() {
  const t = useTranslations();
  const registryQ = useRegistry();
  const iconsQ = useSkillIcons();
  const installMut = useInstallSkill();
  const uninstallMut = useUninstallSkill();

  const [filter, setFilter] = useState<RegistryFilter>({ q: "", showInstalledOnly: false });

  const filtered = useMemo(() => filterRegistry(registryQ.data ?? [], filter), [registryQ.data, filter]);
  const installedCount = (registryQ.data ?? []).filter((s) => s.installed).length;

  return (
    <div className="overflow-auto py-[18px] px-6 flex flex-col gap-[14px]">
      <SkillSourcesCard />
      <Card>
        <CardHeader
          title={t("skills.title")}
          sub={t("skills.card_sub", { installed: installedCount, total: registryQ.data?.length ?? 0 })}
        />
        <div className="p-4 flex gap-3 items-center flex-wrap">
          <div className="flex-1 min-w-[220px]">
            <TextInput
              value={filter.q}
              onChange={(e) => setFilter((f) => ({ ...f, q: e.target.value }))}
              placeholder={t("skills.filter_placeholder")}
            />
          </div>
          <Checkbox
            checked={filter.showInstalledOnly}
            onChange={(e) => setFilter((f) => ({ ...f, showInstalledOnly: e.target.checked }))}
            label={t("skills.installed_only_label")}
          />
        </div>
      </Card>

      {registryQ.isLoading ? (
        <Skeleton width="100%" height={300} />
      ) : filtered.length === 0 ? (
        <EmptyState icon="cpu" title={t("skills.no_results_title")} description={t("common.empty")} />
      ) : (
        <div className="flex flex-col gap-3 [&>*]:w-full">
          {filtered.map((s) => (
            <SkillCard
              key={`${s.source}-${s.name}`}
              skill={s}
              icons={iconsQ.data}
              busy={installMut.isPending || uninstallMut.isPending}
              onInstall={() =>
                installMut.mutate({ source: s.source, ref: s.ref, path: s.path, name: s.name })
              }
              onUninstall={() => uninstallMut.mutate(s.name)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function SkillCard({
  skill,
  icons,
  busy,
  onInstall,
  onUninstall,
}: {
  skill: RegistrySkill;
  icons: SkillIconMap | undefined;
  busy: boolean;
  onInstall: () => void;
  onUninstall: () => void;
}) {
  const t = useTranslations();
  const [editing, setEditing] = useState(false);
  const setIconMut = useSetSkillIcon();
  const key = skillIconKey(skill);
  const config = skillIconConfig(icons, key);
  return (
    <Card>
      <div className="p-[14px] flex gap-4 h-full">
        <button
          type="button"
          onClick={() => setEditing(true)}
          title={t("skills.edit_icon")}
          className="shrink-0 self-start rounded hover:bg-bg-2 transition-colors"
        >
          <WeaponIcon config={config} size={80} particles="themed" />
        </button>
        <WeaponIconModal
          open={editing}
          name={skill.name}
          current={config}
          onSave={(cfg) => setIconMut.mutate({ key, config: cfg })}
          onClose={() => setEditing(false)}
        />
        <div className="flex flex-col gap-2 flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <strong className="text-[18px]">{skill.name}</strong>
            {skill.installed ? (
              <Tag className="ml-auto bg-acc-faint text-acc">{t("skills.installed_badge")}</Tag>
            ) : null}
          </div>
          <div className="text-xs text-txt-2 min-h-8">
            {skill.description || t("skills.description_empty")}
          </div>
          <div className="flex flex-wrap gap-1">
            {skill.tags.slice(0, 4).map((tag) => (
              <Tag key={tag}>{tag}</Tag>
            ))}
          </div>
          <div className="mt-auto flex items-center justify-between">
            <span className="font-mono text-[11px] text-txt-3">
              {skill.source}@{skill.ref}
            </span>
            {skill.installed ? (
              <Button size="sm" onClick={onUninstall} disabled={busy}>
                {t("skills.remove_button")}
              </Button>
            ) : (
              <Button size="sm" variant="primary" onClick={onInstall} disabled={busy}>
                {t("skills.install_button")}
              </Button>
            )}
          </div>
        </div>
      </div>
    </Card>
  );
}
