"use client";

import { useState, useEffect, useMemo, type ReactNode } from "react";
import { match } from "ts-pattern";
import { useTranslations } from "next-intl";
import { TextInput } from "@/components/ui/text-input";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/cn";
import { PlanetCanvas } from "@/components/ui/planet-canvas";
import { useScanProjects, useSettings, useWriteSettings } from "../hooks/use-settings";
import { AboutYouTab } from "./tabs/about-you-tab";
import { PerformanceTab } from "./tabs/performance-tab";
import { CleanupPanel } from "./tabs/cleanup-panel";
import { BundledAgentsTab } from "./tabs/bundled-agents-tab";
import { IntegrationsTab } from "./tabs/integrations-tab";
import { SettingsNav, type SettingsTabValue } from "./settings-nav";
import { SecretsTab } from "@/modules/secrets/components/secrets-tab";
import { useProjects, useUpdateProject } from "@/modules/projects/hooks/use-projects";
import { RemoveProjectModal, type RemovableProject } from "@/modules/projects/components/remove-project-modal";
import { useTabsStore } from "@/lib/tabs-store";
import { relativeTime } from "@/modules/projects/format/format";
import type { PlanetConfig } from "@agent-office/domain/types";

/**
 * Content column. Fills all remaining width next to the nav rail — every
 * tab shares the same column width, no per-tab max-width.
 */
function SettingsSection({ children }: { children: ReactNode }) {
  return (
    <div className="flex-1 min-w-0 overflow-auto">
      <div className="pb-[20px] flex flex-col gap-[14px]">{children}</div>
    </div>
  );
}

export function SettingsPage() {
  const t = useTranslations();
  const [tab, setTab] = useState<SettingsTabValue>("projects");

  return (
    <div className="flex-1 min-h-0 flex flex-nowrap gap-[16px] px-[20px] pt-[16px] pb-[20px] max-[640px]:flex-col max-[640px]:gap-[10px] max-[640px]:px-[10px] max-[640px]:pb-[10px]">
      <SettingsNav value={tab} onChange={setTab} ariaLabel={t("settings.tabs_aria")} />
      {match(tab)
        .with("projects", () => (
          <SettingsSection><ProjectsPane /></SettingsSection>
        ))
        .with("bundled-agents", () => (
          <SettingsSection><BundledAgentsTab /></SettingsSection>
        ))
        .with("integrations", () => (
          <SettingsSection><IntegrationsTab /></SettingsSection>
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
  const [addingPattern, setAddingPattern] = useState(false);
  const [patternDraft, setPatternDraft] = useState("");
  const [savedAt, setSavedAt] = useState<number | null>(null);

  useEffect(() => {
    if (settingsQ.data) {
      setRoot(settingsQ.data.projectsRoot);
      setExcluded(settingsQ.data.excluded);
    }
  }, [settingsQ.data]);

  const scanQ = useScanProjects(root, excluded);
  // Shelve state, session/agent counts, last-run time, and the planet icon
  // are all project-registry concepts (not scan-time filesystem facts), so
  // merge them onto the scan entries by id.
  const projectsQ = useProjects();
  const updateProject = useUpdateProject();
  const [removing, setRemoving] = useState<RemovableProject | null>(null);
  const [view, setView] = useState<"active" | "shelved">("active");
  const [filter, setFilter] = useState("");
  const tabs = useTabsStore((s) => s.tabs);
  const openProjectIds = useMemo(() => new Set(tabs.map((tb) => tb.projectId)), [tabs]);
  const projectById = useMemo(
    () => new Map((projectsQ.data ?? []).map((p) => [p.id, p])),
    [projectsQ.data],
  );

  const scanned = scanQ.data ?? [];
  const activeEntries = scanned.filter((e) => !projectById.get(e.id)?.shelved);
  const shelvedEntries = scanned.filter((e) => projectById.get(e.id)?.shelved);
  const visibleList = view === "active" ? activeEntries : shelvedEntries;
  const q = filter.trim().toLowerCase();
  const filteredList = q
    ? visibleList.filter((e) => e.name.toLowerCase().includes(q) || e.fullPath.toLowerCase().includes(q))
    : visibleList;

  const onSave = () => {
    writeMut.mutate(
      { projectsRoot: root.trim(), excluded },
      { onSuccess: () => setSavedAt(Date.now()) },
    );
  };

  const addPattern = () => {
    const v = patternDraft.trim();
    if (v && !excluded.includes(v)) setExcluded((prev) => [...prev, v]);
    setPatternDraft("");
    setAddingPattern(false);
  };

  if (settingsQ.isLoading) return null;

  return (
    <>
      <div className="rounded-[22px] surface-sheen shadow-[var(--lift)] overflow-hidden">
        <div className="flex items-center gap-[11px] px-[20px] py-[15px] border-b border-edge">
          <div className="leading-[1.3] min-w-0">
            <div className="text-[14.5px] font-bold whitespace-nowrap">{t("settings.projects_root_card_title")}</div>
            <div className="text-[10.5px] text-txt-4 whitespace-nowrap">{t("settings.projects_root_card_sub")}</div>
          </div>
          <span className="flex-1" />
          {scanQ.dataUpdatedAt ? (
            <span className="font-mono text-[10px] text-txt-4 whitespace-nowrap">
              {t("settings.rescanned_at", { time: relativeTime(scanQ.dataUpdatedAt) })}
            </span>
          ) : null}
        </div>
        <div className="px-[20px] py-[16px] flex flex-col gap-[14px]">
          <div className="flex items-center gap-[9px]">
            <div className="flex-1 min-w-0 flex items-center gap-[10px] px-[14px] py-[11px] rounded-[14px] bg-card-2 border border-edge shadow-[var(--inset-hi)]">
              <Icon name="folder" size={14} className="text-txt-4 shrink-0" />
              <input
                value={root}
                onChange={(e) => setRoot(e.target.value)}
                spellCheck={false}
                placeholder={t("settings.projects_root_placeholder")}
                className="flex-1 min-w-0 border-none bg-transparent outline-none text-txt font-[var(--font-mono)] text-[12.5px] placeholder:text-txt-4"
              />
            </div>
            {savedAt ? (
              <span className="text-[11px] text-status-done whitespace-nowrap">{t("common.saved")}</span>
            ) : null}
            <button
              type="button"
              onClick={onSave}
              disabled={writeMut.isPending || !root.trim()}
              className="px-[16px] py-[11px] rounded-[14px] border border-edge-2 bg-card-2 text-txt-2 text-[12.5px] font-semibold whitespace-nowrap cursor-pointer transition-all duration-150 hover:text-txt hover:border-txt-4 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {writeMut.isPending ? t("common.saving") : t("common.save")}
            </button>
          </div>
          <div>
            <div className="flex items-center gap-[8px] mb-[9px]">
              <span className="text-[10px] font-bold tracking-[0.07em] uppercase text-txt-4 whitespace-nowrap">
                {t("settings.exclusions_label")}
              </span>
              <span className="flex-1 h-px bg-edge" aria-hidden />
              <span className="font-mono text-[10px] text-txt-4 whitespace-nowrap">
                {t("settings.pattern_count", { count: excluded.length })}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-[7px]">
              {excluded.map((e) => (
                <span
                  key={e}
                  className="flex items-center gap-[8px] py-[6px] pl-[11px] pr-[8px] rounded-[10px] bg-card-2 border border-edge shadow-[var(--inset-hi)] font-mono text-[11px] text-txt-3 whitespace-nowrap"
                >
                  <span className="truncate max-w-[220px]">{e}</span>
                  <button
                    type="button"
                    className="w-[16px] h-[16px] flex items-center justify-center rounded-[5px] cursor-pointer text-txt-4 transition-colors duration-150 hover:bg-red-soft hover:text-red"
                    aria-label={t("settings.exclusion_remove_aria", { name: e })}
                    onClick={() => setExcluded((prev) => prev.filter((x) => x !== e))}
                    title={t("settings.exclusion_remove_aria", { name: e })}
                  >
                    <Icon name="x" size={9} />
                  </button>
                </span>
              ))}
              {addingPattern ? (
                <TextInput
                  autoFocus
                  value={patternDraft}
                  onChange={(e) => setPatternDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") { e.preventDefault(); addPattern(); }
                    if (e.key === "Escape") { setPatternDraft(""); setAddingPattern(false); }
                  }}
                  onBlur={addPattern}
                  placeholder={t("settings.exclusions_placeholder")}
                  className="h-[26px] w-[160px] rounded-[10px] bg-card-2 border-edge shadow-[var(--inset-hi)] font-mono text-[11px] px-[11px]"
                />
              ) : (
                <button
                  type="button"
                  onClick={() => setAddingPattern(true)}
                  className="flex items-center gap-[6px] py-[6px] px-[12px] rounded-[10px] border border-dashed border-edge-2 bg-transparent text-txt-4 text-[11px] font-semibold whitespace-nowrap cursor-pointer transition-all duration-150 hover:text-acc hover:border-acc-line"
                >
                  <Icon name="plus" size={10} /> {t("settings.pattern_add")}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-[22px] surface-sheen shadow-[var(--lift)] overflow-hidden">
        <div className="flex items-center gap-[11px] px-[20px] py-[15px] border-b border-edge">
          <div className="leading-[1.3] min-w-0">
            <div className="text-[14.5px] font-bold whitespace-nowrap">{t("settings.scanned_card_title")}</div>
            <div className="text-[10.5px] text-txt-4 whitespace-nowrap">{t("settings.scanned_card_sub")}</div>
          </div>
          <span className="flex-1" />
          <div className="flex items-center gap-[2px] p-[4px] rounded-[13px] bg-card-2 border border-edge shadow-[var(--inset-hi)] shrink-0">
            <SegBtn active={view === "active"} onClick={() => setView("active")}>
              {t("settings.view_active")} <span className="font-mono text-[9.5px] opacity-70">{activeEntries.length}</span>
            </SegBtn>
            <SegBtn active={view === "shelved"} onClick={() => setView("shelved")}>
              {t("settings.view_shelved")} <span className="font-mono text-[9.5px] opacity-70">{shelvedEntries.length}</span>
            </SegBtn>
          </div>
        </div>

        {scanQ.isLoading ? null : scanned.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-[10px] py-[38px] text-center">
            <span className="flex items-center justify-center w-[40px] h-[40px] rounded-full bg-card-2 border border-edge text-txt-4">
              <Icon name="folder" size={18} />
            </span>
            <span className="text-[12.5px] text-txt-3 max-w-[320px]">{t("settings.scanned_empty")}</span>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-[10px] px-[20px] py-[11px] border-b border-edge bg-card-2">
              <div className="flex-1 min-w-0 flex items-center gap-[9px] px-[11px] py-[7px] rounded-[11px] bg-card border border-edge shadow-[var(--inset-hi)] cursor-text">
                <Icon name="search" size={12} className="text-txt-4 shrink-0" />
                <input
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                  placeholder={t("settings.projects_filter_placeholder")}
                  className="flex-1 min-w-0 border-none bg-transparent outline-none text-[11.5px] text-txt placeholder:text-txt-4"
                />
              </div>
              <span className="font-mono text-[10.5px] text-txt-4 whitespace-nowrap">
                {t("settings.scanned_counts", { active: activeEntries.length, shelved: shelvedEntries.length })}
              </span>
              <button
                type="button"
                onClick={() => scanQ.refetch()}
                disabled={scanQ.isFetching}
                className="flex items-center gap-[7px] py-[7px] px-[13px] rounded-[11px] bg-card border border-edge shadow-[var(--inset-hi)] cursor-pointer text-txt-3 text-[11.5px] font-semibold whitespace-nowrap transition-all duration-150 hover:text-txt hover:border-txt-4 disabled:opacity-50"
              >
                <Icon name="refresh" size={12} className={scanQ.isFetching ? "animate-spin" : undefined} /> {t("settings.rescan")}
              </button>
            </div>

            {filteredList.length === 0 ? (
              <div className="py-[16px] text-center text-[12.5px] text-txt-3">{t("agent_list.no_matches")}</div>
            ) : (
              <div className="flex flex-col">
                {filteredList.map((entry) => (
                  <ScanProjectRow
                    key={entry.id}
                    entry={entry}
                    project={projectById.get(entry.id)}
                    open={openProjectIds.has(entry.id)}
                    shelved={view === "shelved"}
                    busy={updateProject.isPending}
                    excludedLabel={t("settings.excluded_badge")}
                    onToggleShelve={() =>
                      updateProject.mutate({ id: entry.id, patch: { meta: { shelved: view !== "shelved" } } })
                    }
                    onRemove={() => setRemoving({ id: entry.id, name: entry.name, fullPath: entry.fullPath })}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </div>

      <RemoveProjectModal project={removing} onClose={() => setRemoving(null)} />
    </>
  );
}

function SegBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "flex items-center gap-[7px] py-[6px] px-[13px] rounded-[10px] text-[11.5px] font-semibold cursor-pointer whitespace-nowrap transition-[filter] duration-150",
        active
          ? "bg-[linear-gradient(120deg,var(--acc-cta),var(--acc-2))] text-white shadow-[0_8px_18px_-10px_color-mix(in_srgb,var(--acc)_80%,transparent)]"
          : "bg-transparent text-txt-4 hover:brightness-110",
      )}
    >
      {children}
    </button>
  );
}

/** One row in the settings scanned-projects list: planet icon, name (+ open
 *  badge), path, session/last-run meta, an optional excluded badge, and
 *  per-project shelve/unshelve + delete-folder actions. */
function ScanProjectRow({
  entry,
  project,
  open,
  shelved,
  busy,
  excludedLabel,
  onToggleShelve,
  onRemove,
}: {
  entry: { id: string; name: string; fullPath: string; excluded: boolean };
  project: { instanceCount: number; lastRunAt?: number; planet?: PlanetConfig } | undefined;
  open: boolean;
  shelved: boolean;
  busy: boolean;
  excludedLabel: string;
  onToggleShelve: () => void;
  onRemove: () => void;
}) {
  const t = useTranslations();
  const shelveLabel = shelved ? t("settings.unshelve") : t("settings.shelve");
  return (
    <div
      className={cn(
        "flex items-center gap-[13px] px-[20px] py-[12px] border-b border-edge transition-colors duration-150 hover:bg-card-2",
        entry.excluded && "opacity-60",
      )}
    >
      <PlanetCanvas projectId={entry.id} config={project?.planet} size={30} className="rounded-full shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-[9px]">
          <span className="text-[13px] font-bold whitespace-nowrap overflow-hidden text-ellipsis">{entry.name}</span>
          {open ? (
            <span className="flex items-center gap-[5px] py-[1.5px] px-[8px] rounded-full bg-green-soft text-green text-[9.5px] font-bold whitespace-nowrap">
              <span className="w-[4px] h-[4px] rounded-full bg-green" aria-hidden />{t("settings.badge_open")}
            </span>
          ) : null}
          {shelved ? (
            <span className="py-[1.5px] px-[8px] rounded-full bg-card-3 text-txt-4 text-[9.5px] font-bold whitespace-nowrap">{t("settings.badge_shelved")}</span>
          ) : null}
          {entry.excluded ? <span className="text-[10.5px] text-txt-4 whitespace-nowrap">{excludedLabel}</span> : null}
        </div>
        <div className="font-mono text-[10.5px] text-txt-4 mt-[4px] whitespace-nowrap overflow-hidden text-ellipsis">{entry.fullPath}</div>
      </div>
      {project ? (
        <span className="shrink-0 font-mono text-[10.5px] text-txt-4 whitespace-nowrap">
          {t("settings.agent_count", { count: project.instanceCount })}
          {project.lastRunAt ? ` · ${relativeTime(project.lastRunAt)}` : ""}
        </span>
      ) : null}
      <div className="flex items-center gap-[6px] shrink-0">
        <button
          type="button"
          onClick={onToggleShelve}
          disabled={busy}
          title={shelveLabel}
          aria-label={`${shelveLabel} ${entry.name}`}
          className="flex items-center gap-[7px] py-[6px] px-[11px] rounded-[9px] text-txt-4 text-[11.5px] font-semibold cursor-pointer whitespace-nowrap transition-all duration-150 hover:bg-card-3 hover:text-txt disabled:opacity-50"
        >
          <Icon name={shelved ? "eye" : "archive"} size={12} />
          <span className="max-[720px]:hidden">{shelveLabel}</span>
        </button>
        <button
          type="button"
          onClick={onRemove}
          title={t("settings.delete_folder")}
          aria-label={t("settings.delete_folder_aria", { name: entry.name })}
          className="w-[28px] h-[28px] flex items-center justify-center rounded-[9px] text-txt-4 cursor-pointer transition-all duration-150 hover:bg-red-soft hover:text-red"
        >
          <Icon name="trash" size={13} />
        </button>
      </div>
    </div>
  );
}
