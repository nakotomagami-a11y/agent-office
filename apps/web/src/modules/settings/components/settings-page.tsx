"use client";

import { useState, useEffect, type ReactNode } from "react";
import { match } from "ts-pattern";
import { useTranslations } from "next-intl";
import { Card } from "@/components/ui/card";
import { CardHeader } from "@/components/ui/card-header";
import { TextInput } from "@/components/ui/text-input";
import { Skeleton } from "@/components/ui/skeleton";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/button";
import { useScanProjects, useSettings, useWriteSettings } from "../hooks/use-settings";
import { AboutYouTab } from "./tabs/about-you-tab";
import { PerformanceTab } from "./tabs/performance-tab";
import { CleanupPanel } from "./tabs/cleanup-panel";
import { BundledAgentsTab } from "./tabs/bundled-agents-tab";
import { SettingsNav, type SettingsTabValue } from "./settings-nav";
import { AccountsTab } from "@/modules/accounts/components/accounts-tab";
import { GithubAccountsTab } from "@/modules/github-accounts/components/github-accounts-tab";
import { SecretsTab } from "@/modules/secrets/components/secrets-tab";

/**
 * Content column. Everything sits in a single measured column left-aligned
 * against the nav — 720px for forms/prose, 880px for the account surfaces
 * that carry the usage table.
 */
function SettingsSection({ wide, children }: { wide?: boolean; children: ReactNode }) {
  return (
    <div className="flex-1 min-w-0 overflow-auto">
      <div
        className={cn(
          "px-6 py-[20px] flex flex-col gap-[14px]",
          wide ? "max-w-[880px]" : "max-w-[720px]",
        )}
      >
        {children}
      </div>
    </div>
  );
}

export function SettingsPage() {
  const t = useTranslations();
  const [tab, setTab] = useState<SettingsTabValue>("projects");

  return (
    <div className="flex-1 min-h-0 flex flex-nowrap max-[640px]:flex-col">
      <SettingsNav value={tab} onChange={setTab} ariaLabel={t("settings.tabs_aria")} />
      {match(tab)
        .with("projects", () => (
          <SettingsSection><ProjectsPane /></SettingsSection>
        ))
        .with("bundled-agents", () => (
          <SettingsSection><BundledAgentsTab /></SettingsSection>
        ))
        .with("accounts", () => (
          <SettingsSection wide><AccountsTab /></SettingsSection>
        ))
        .with("github-accounts", () => (
          <SettingsSection><GithubAccountsTab /></SettingsSection>
        ))
        .with("secrets", () => (
          <SettingsSection><SecretsTab /></SettingsSection>
        ))
        .with("about-you", () => (
          <SettingsSection><AboutYouTab /></SettingsSection>
        ))
        .with("performance", () => (
          <SettingsSection><PerformanceTab /></SettingsSection>
        ))
        .with("cleanup", () => (
          <SettingsSection><CleanupPanel /></SettingsSection>
        ))
        .exhaustive()}
    </div>
  );
}

/**
 * Projects pane — the original single-view settings surface: pick the
 * projects root, manage exclusions, and preview what the scanner picks up.
 * Rendered as one entry in the grouped settings nav; kept as its own
 * component so form state does not leak across nav sections.
 */
function ProjectsPane() {
  const t = useTranslations();
  const settingsQ = useSettings();
  const writeMut = useWriteSettings();

  const [root, setRoot] = useState("");
  const [excluded, setExcluded] = useState<string[]>([]);
  const [excludedDraft, setExcludedDraft] = useState("");
  const [savedAt, setSavedAt] = useState<number | null>(null);

  useEffect(() => {
    if (settingsQ.data) {
      setRoot(settingsQ.data.projectsRoot);
      setExcluded(settingsQ.data.excluded);
    }
  }, [settingsQ.data]);

  const scanQ = useScanProjects(root, excluded);

  const onSave = () => {
    writeMut.mutate(
      { projectsRoot: root.trim(), excluded },
      { onSuccess: () => setSavedAt(Date.now()) },
    );
  };

  const addExclusion = () => {
    const v = excludedDraft.trim();
    if (!v || excluded.includes(v)) return;
    setExcluded((prev) => [...prev, v]);
    setExcludedDraft("");
  };

  if (settingsQ.isLoading) {
    return <Skeleton width="100%" height={120} />;
  }

  return (
    <>
      <Card>
        <CardHeader title={t("settings.projects_root_card_title")} sub={t("settings.projects_root_card_sub")} />
        <div className="p-4 flex flex-col gap-3">
          <TextInput
            value={root}
            onChange={(e) => setRoot(e.target.value)}
            placeholder={t("settings.projects_root_placeholder")}
          />
          <div>
            <div className="text-[11px] text-txt-3 font-mono uppercase tracking-[0.06em] mb-[6px]">
              {t("settings.exclusions_label")}
            </div>
            <div className="flex gap-2 mb-2">
              <TextInput
                value={excludedDraft}
                onChange={(e) => setExcludedDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addExclusion();
                  }
                }}
                placeholder={t("settings.exclusions_placeholder")}
              />
              <Button onClick={addExclusion}>
                <Icon name="plus" />
              </Button>
            </div>
            <div className="flex flex-wrap gap-[6px]">
              {excluded.map((e) => (
                <span
                  key={e}
                  className="group/tag inline-flex items-stretch h-[24px] rounded-[5px] border border-ao-line-1 bg-ao-bg-3 hover:bg-ao-bg-2 hover:border-[color-mix(in_oklab,var(--ao-line-1)_60%,var(--ao-fg-2))] transition-[background,border-color] duration-[120ms] [box-shadow:inset_0_-1px_0_0_rgba(0,0,0,0.15)] overflow-hidden"
                >
                  <span className="inline-flex items-center gap-[6px] pl-[8px] pr-[8px] font-mono text-[11.5px] text-ao-fg-1 tracking-[-0.005em] leading-none">
                    <Icon name="folder" size={10} className="text-ao-fg-3 shrink-0" />
                    <span className="truncate max-w-[220px]">{e}</span>
                  </span>
                  <button
                    type="button"
                    className="inline-flex items-center justify-center w-[22px] border-l border-ao-line-1 text-ao-fg-3 hover:text-ao-bad hover:bg-[color-mix(in_oklab,var(--ao-bad)_18%,transparent)] focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ao-accent-line transition-[background,color] duration-[120ms]"
                    aria-label={t("settings.exclusion_remove_aria", { name: e })}
                    onClick={() => setExcluded((prev) => prev.filter((x) => x !== e))}
                    title={t("settings.exclusion_remove_aria", { name: e })}
                  >
                    <Icon name="x" size={10} />
                  </button>
                </span>
              ))}
              {excluded.length === 0 ? (
                <span className="text-[11.5px] text-ao-fg-3 font-mono italic">{t("settings.exclusions_empty")}</span>
              ) : null}
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            {savedAt ? (
              <span className="self-center text-xs text-status-done">{t("common.saved")}</span>
            ) : null}
            <Button
              variant="primary"
              disabled={writeMut.isPending || !root.trim()}
              onClick={onSave}
            >
              {writeMut.isPending ? t("common.saving") : t("common.save")}
            </Button>
          </div>
        </div>
      </Card>

      <Card>
        <CardHeader
          title={t("settings.scanned_card_title")}
          sub={t("settings.scanned_card_sub", {
            visible: scanQ.data?.filter((e) => !e.excluded).length ?? 0,
            excluded: scanQ.data?.filter((e) => e.excluded).length ?? 0,
          })}
        />
        <div className="p-4">
          {scanQ.isLoading ? (
            <Skeleton width="100%" height={80} />
          ) : !scanQ.data || scanQ.data.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-[10px] py-[28px] text-center">
              <span className="flex items-center justify-center w-[40px] h-[40px] rounded-full bg-bg-2 border border-line text-txt-4">
                <Icon name="folder" size={18} />
              </span>
              <span className="text-[12.5px] text-txt-3 max-w-[320px]">{t("settings.scanned_empty")}</span>
            </div>
          ) : (
            <ul className="list-none m-0 p-0 flex flex-col gap-1">
              {scanQ.data.map((entry) => (
                <li
                  key={entry.id}
                  className={cn(
                    "flex items-center gap-[10px] px-2 py-[6px] rounded-md text-[12.5px]",
                    entry.excluded ? "text-txt-4 bg-transparent" : "text-txt bg-bg-2",
                  )}
                >
                  <Icon name="folder" size={13} />
                  <span className="font-medium">{entry.name}</span>
                  <span className="font-mono text-[11px] text-txt-3 truncate">{entry.fullPath}</span>
                  {entry.excluded ? (
                    <span className="ml-auto text-[11px] text-txt-4">{t("settings.excluded_badge")}</span>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </div>
      </Card>
    </>
  );
}
