"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@agent-office/domain/hooks/api";
import { queryKeys } from "@agent-office/domain/hooks/query-keys";
import { API_ROUTES } from "@agent-office/domain/config/routes";
import type { AppSettings, ScannedEntry, Project, HealthInfo } from "@agent-office/domain/types";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { useActiveProjectStore } from "@/lib/active-project-store";
import { getUiSettings, patchUiSettings } from "@/lib/api/ui-settings";
import { cn } from "@/lib/cn";
import { RequirementsStep } from "./first-run-wizard-steps/requirements-step";
import { RootStep } from "./first-run-wizard-steps/root-step";
import { ExcludedStep } from "./first-run-wizard-steps/excluded-step";
import { AgentsStep } from "./first-run-wizard-steps/agents-step";
import { ProjectStep } from "./first-run-wizard-steps/project-step";
import { IntegrationsStep } from "./first-run-wizard-steps/integrations-step";
import { INTEGRATIONS } from "@agent-office/domain/config/integrations";

const DEFAULT_EXCLUDED = [
  "node_modules",
  ".git",
  ".next",
  "dist",
  "build",
  "_legacy",
  "PIXEL",
  ".pnpm-store",
];

const HOME_FALLBACK = "~/Documents";

const DRAFT_KEY = "agent-office:wizard-draft";

interface StarterAgent {
  id: string;
  name: string;
  description: string;
  unit?: string;
  room?: string;
}

type Step = "requirements" | "root" | "excluded" | "integrations" | "agents" | "project";
const STEP_ORDER: Step[] = ["requirements", "root", "excluded", "integrations", "agents", "project"];

interface WizardDraft {
  step: Step;
  root: string;
  excluded: string[];
  selectedAgents: string[];
  chosenFolderIds: string[];
  projectName: string;
}

async function loadDraft(): Promise<WizardDraft | null> {
  try {
    const raw = (await getUiSettings())[DRAFT_KEY];
    if (!raw) return null;
    return JSON.parse(raw) as WizardDraft;
  } catch {
    return null;
  }
}

function saveDraft(draft: WizardDraft) {
  patchUiSettings({ [DRAFT_KEY]: JSON.stringify(draft) }).catch(() => {
    /* best-effort — losing the draft is not fatal */
  });
}

function clearDraft() {
  patchUiSettings({ [DRAFT_KEY]: "" }).catch(() => {
    /* ignore */
  });
}

export function FirstRunWizard({ allowSkip, onDone }: { allowSkip?: boolean; onDone: () => void }) {
  const t = useTranslations();
  const qc = useQueryClient();
  const setActiveProjectId = useActiveProjectStore((s) => s.setId);

  // The draft lives in `ui_settings` (see loadDraft), so it arrives async and
  // cannot seed useState. Start on defaults, then apply the stored draft once.
  const [draft, setDraft] = useState<WizardDraft | null>(null);
  const [hydrated, setHydrated] = useState(false);

  const [step, setStep] = useState<Step>("requirements");
  const [root, setRoot] = useState(HOME_FALLBACK);
  const [excluded, setExcluded] = useState<string[]>(DEFAULT_EXCLUDED);
  const [excludedInput, setExcludedInput] = useState("");
  const [selectedAgents, setSelectedAgents] = useState<Set<string>>(new Set());
  const [selectedIntegrations, setSelectedIntegrations] = useState<Record<string, boolean>>(
    () => Object.fromEntries(INTEGRATIONS.map((i) => [i.id, i.defaultEnabled])),
  );
  const [chosenFolderIds, setChosenFolderIds] = useState<Set<string>>(new Set());
  const [projectName, setProjectName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void loadDraft().then((d) => {
      if (cancelled) return;
      if (d) {
        setDraft(d);
        if (d.step) setStep(d.step);
        if (d.root) setRoot(d.root);
        if (d.excluded) setExcluded(d.excluded);
        if (d.selectedAgents) setSelectedAgents(new Set(d.selectedAgents));
        if (d.chosenFolderIds) setChosenFolderIds(new Set(d.chosenFolderIds));
        if (d.projectName) setProjectName(d.projectName);
      }
      setHydrated(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Persist draft after every meaningful state change. Gated on `hydrated` so
  // the initial defaults can't overwrite a stored draft before it arrives.
  useEffect(() => {
    if (!hydrated) return;
    saveDraft({
      step,
      root,
      excluded,
      selectedAgents: [...selectedAgents],
      chosenFolderIds: [...chosenFolderIds],
      projectName,
    });
  }, [hydrated, step, root, excluded, selectedAgents, chosenFolderIds, projectName]);

  const healthQ = useQuery({
    queryKey: ["wizard-health"],
    queryFn: () => apiFetch<HealthInfo>(API_ROUTES.health),
    refetchInterval: (q) => (q.state.data?.available ? false : 5000),
  });

  const starterQ = useQuery({
    queryKey: ["starter-agents"],
    queryFn: () => apiFetch<StarterAgent[]>("/api/starter/agents"),
  });
  const starter = useMemo(() => starterQ.data ?? [], [starterQ.data]);

  // Pre-select every starter agent the first time the list loads, but only
  // when there was no saved draft (so saved selections aren't overwritten).
  // Waits for hydration — before it, `draft` is null and a stored selection
  // would look like "no draft".
  useEffect(() => {
    if (!hydrated) return;
    if (starter.length > 0 && selectedAgents.size === 0 && !draft?.selectedAgents) {
      setSelectedAgents(new Set(starter.map((a) => a.id)));
    }
  }, [hydrated, starter, selectedAgents.size, draft?.selectedAgents]);

  const scanParams = useMemo(() => {
    const p = new URLSearchParams();
    p.set("root", root);
    if (excluded.length > 0) p.set("excluded", excluded.join(","));
    // Include excluded entries too — the Workspace step's live preview wants
    // to show one as an "ignored" example. The Project step filters them
    // back out before rendering pickable rows (see `projectCandidates`).
    p.set("includeExcluded", "1");
    return p.toString();
  }, [root, excluded]);

  const scanQ = useQuery({
    queryKey: ["wizard-scan", root, excluded.join(",")],
    queryFn: () => apiFetch<ScannedEntry[]>(`${API_ROUTES.settingsScan}?${scanParams}`),
    enabled: (step === "root" || step === "project") && root.length > 0,
  });
  const candidates = scanQ.data ?? [];
  const projectCandidates = useMemo(() => (scanQ.data ?? []).filter((c) => !c.excluded), [scanQ.data]);

  const finishMut = useMutation({
    mutationFn: async () => {
      await apiFetch<AppSettings>(API_ROUTES.settings, {
        method: "PUT",
        body: { projectsRoot: root.trim(), excluded },
      });

      await apiFetch<AppSettings>(API_ROUTES.settings, {
        method: "PATCH",
        body: { integrations: selectedIntegrations },
      });

      if (selectedAgents.size > 0) {
        await apiFetch<{ imported: number }>("/api/starter/agents", {
          method: "POST",
          body: { agentIds: [...selectedAgents] },
        });
      }

      // Create all selected projects. Custom name only applies when exactly one is chosen.
      const chosen = projectCandidates.filter((c) => chosenFolderIds.has(c.id));
      let lastCreatedId: string | null = null;
      if (chosen.length > 0) {
        for (const folder of chosen) {
          const name = chosen.length === 1 && projectName.trim() ? projectName.trim() : folder.name;
          const project = await apiFetch<Project>(API_ROUTES.projects, {
            method: "POST",
            body: { id: folder.id, name },
          });
          lastCreatedId = project.id;
        }
      } else if (projectName.trim()) {
        // No scanned folders — create a new folder under projectsRoot from the typed name.
        const project = await apiFetch<Project>(API_ROUTES.projects, {
          method: "POST",
          body: { name: projectName.trim() },
        });
        lastCreatedId = project.id;
      }
      return { createdId: lastCreatedId };
    },
    onSuccess: ({ createdId }) => {
      clearDraft();
      if (createdId) setActiveProjectId(createdId);
      setBusy(false);
      setDismissed(true);
      qc.invalidateQueries({ queryKey: queryKeys.settings.all });
      qc.invalidateQueries({ queryKey: queryKeys.projects.all });
      qc.invalidateQueries({ queryKey: queryKeys.agents.all });
      onDone();
    },
    onError: (err) => {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    },
  });

  // Returning users only (see `allowSkip` — settings already existed before
  // this run of the wizard). Just marks setup complete and closes; doesn't
  // touch the root/excluded/integrations/agents/project the user already has.
  const skipMut = useMutation({
    mutationFn: () => apiFetch<AppSettings>(API_ROUTES.settings, {
      method: "PATCH",
      body: { firstRunComplete: true },
    }),
    onSuccess: () => {
      clearDraft();
      setBusy(false);
      setDismissed(true);
      qc.invalidateQueries({ queryKey: queryKeys.settings.all });
      onDone();
    },
    onError: (err) => {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    },
  });

  const onSkip = () => {
    setError(null);
    setBusy(true);
    skipMut.mutate();
  };

  const onFinish = () => {
    if (!root.trim()) {
      setError(t("first_run.error_root_required"));
      setStep("root");
      return;
    }
    setError(null);
    setBusy(true);
    finishMut.mutate();
  };

  const stepIdx = STEP_ORDER.indexOf(step);
  const isFirst = stepIdx === 0;
  const isLast = stepIdx === STEP_ORDER.length - 1;

  const goNext = () => {
    if (step === "requirements" && !healthQ.data?.available) {
      setError(t("first_run.req_block"));
      return;
    }
    if (step === "root" && !root.trim()) {
      setError(t("first_run.error_root_required"));
      return;
    }
    setError(null);
    setStep(STEP_ORDER[stepIdx + 1] ?? "project");
  };
  const goBack = () => {
    setError(null);
    setStep(STEP_ORDER[Math.max(0, stepIdx - 1)] ?? "root");
  };
  const jumpTo = (s: Step) => {
    const targetIdx = STEP_ORDER.indexOf(s);
    if (targetIdx < stepIdx) {
      setError(null);
      setStep(s);
    }
  };

  const addExcluded = () => {
    const v = excludedInput.trim();
    if (!v) return;
    if (excluded.includes(v)) {
      setExcludedInput("");
      return;
    }
    setExcluded((prev) => [...prev, v]);
    setExcludedInput("");
  };
  const removeExcluded = (name: string) => {
    setExcluded((prev) => prev.filter((x) => x !== name));
  };

  const toggleAgent = (id: string) => {
    setSelectedAgents((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const toggleAll = () => {
    if (selectedAgents.size === starter.length) setSelectedAgents(new Set());
    else setSelectedAgents(new Set(starter.map((a) => a.id)));
  };

  if (dismissed) return null;

  return (
    <div
      className="fixed inset-0 flex items-center justify-center z-[9999] p-6 backdrop-blur-sm bg-black/72"
      role="dialog"
      aria-modal="true"
      aria-labelledby="fr-title"
    >
      <div
        className="pointer-events-none absolute left-1/2 top-[-160px] h-[460px] w-[760px] -translate-x-1/2 bg-[radial-gradient(circle,color-mix(in_srgb,var(--acc)_16%,transparent),transparent_64%)]"
        aria-hidden
      />
      <div className="relative flex w-[min(800px,100%)] max-h-[90vh] flex-col overflow-hidden rounded-[26px] surface-sheen shadow-[var(--lift)] animate-[jump-pill-in_260ms_cubic-bezier(0.22,0.8,0.3,1)]">
        <header className="shrink-0 px-[26px] pt-[22px]">
          <div className="flex items-start gap-[14px]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/icons/scroll.png"
              alt=""
              width={80}
              height={80}
              className="shrink-0 object-contain animate-[bob_3.4s_ease-in-out_infinite]"
            />
            <div className="min-w-0 flex-1">
              <div id="fr-title" className="text-[22px] font-extrabold leading-[1.15] tracking-[-0.035em]">
                {t("first_run.title")}
              </div>
              <p className="mt-[5px] text-[13px] leading-[1.55] text-txt-3 text-pretty">{t("first_run.subtitle")}</p>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-[8px]">
              <span className="flex items-center gap-[7px] rounded-full bg-acc-soft px-[11px] py-[5px] shadow-[inset_0_0_0_1px_var(--acc-line)]">
                <span className="font-mono text-[10px] font-medium uppercase tracking-[0.07em] text-acc">
                  {t("first_run.badge")}
                </span>
              </span>
              {allowSkip ? (
                <button
                  type="button"
                  onClick={onSkip}
                  disabled={busy}
                  className="text-[11px] font-semibold text-txt-3 underline-offset-2 transition-colors hover:text-acc hover:underline disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {t("first_run.skip")}
                </button>
              ) : null}
            </div>
          </div>

          <ol className="m-0 mt-[18px] flex list-none items-center gap-[6px] p-0">
            {STEP_ORDER.map((s, i) => {
              const isActive = i === stepIdx;
              const isPast = i < stepIdx;
              return (
                <li key={s}>
                  <button
                    type="button"
                    onClick={() => jumpTo(s)}
                    disabled={!isPast}
                    title={isPast ? t("first_run.back_to_step", { step: t(`first_run.step_${s}`) }) : undefined}
                    className={cn(
                      "flex items-center gap-[7px] rounded-full bg-transparent py-[5px] pl-[5px] pr-[11px] shadow-[inset_0_0_0_1px_var(--edge)] transition-[box-shadow,background,color] duration-150",
                      isActive && "bg-acc-soft shadow-[inset_0_0_0_1px_var(--acc-line)] cursor-default",
                      isPast && "cursor-pointer hover:shadow-[inset_0_0_0_1px_var(--acc-line)]",
                      !isActive && !isPast && "cursor-default",
                    )}
                  >
                    <span
                      className={cn(
                        "flex h-[19px] w-[19px] shrink-0 items-center justify-center rounded-full font-mono text-[9.5px] font-medium",
                        isActive
                          ? "bg-[linear-gradient(140deg,var(--acc),var(--acc-2))] text-white"
                          : isPast
                            ? "bg-acc-soft text-acc"
                            : "bg-card-2 text-txt-3",
                      )}
                    >
                      {isPast ? <Icon name="check" size={11} /> : i + 1}
                    </span>
                    <span
                      className={cn(
                        "whitespace-nowrap font-mono text-[10px] font-medium uppercase tracking-[0.06em]",
                        isActive ? "text-acc" : isPast ? "text-txt-2" : "text-txt-3",
                      )}
                    >
                      {t(`first_run.step_${s}`)}
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
          <div className="mt-[14px] h-px bg-edge" />
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-[26px] py-5">
          {step === "requirements" ? (
            <RequirementsStep health={healthQ.data} loading={healthQ.isLoading} />
          ) : null}

          {step === "root" ? (
            <RootStep
              root={root}
              onRootChange={setRoot}
              placeholder={HOME_FALLBACK}
              candidates={candidates}
              loading={scanQ.isLoading}
            />
          ) : null}

          {step === "excluded" ? (
            <ExcludedStep
              excluded={excluded}
              input={excludedInput}
              onInputChange={setExcludedInput}
              onAdd={addExcluded}
              onRemove={removeExcluded}
            />
          ) : null}

          {step === "integrations" ? (
            <IntegrationsStep
              selected={selectedIntegrations}
              onToggle={(id, next) => setSelectedIntegrations((prev) => ({ ...prev, [id]: next }))}
            />
          ) : null}

          {step === "agents" ? (
            <AgentsStep
              starter={starter}
              loading={starterQ.isLoading}
              selected={selectedAgents}
              onToggle={toggleAgent}
              onToggleAll={toggleAll}
            />
          ) : null}

          {step === "project" ? (
            <ProjectStep
              candidates={projectCandidates}
              loading={scanQ.isLoading}
              root={root}
              chosen={chosenFolderIds}
              onToggle={(c) => {
                setChosenFolderIds((prev) => {
                  const next = new Set(prev);
                  if (next.has(c.id)) { next.delete(c.id); }
                  else { next.add(c.id); if (next.size === 1) setProjectName(c.name); }
                  return next;
                });
              }}
              projectName={projectName}
              onProjectNameChange={setProjectName}
            />
          ) : null}
        </div>

        {error ? (
          <div
            className="mx-[26px] mb-[14px] rounded-xl border border-[var(--error)] bg-[rgba(239,68,68,0.1)] px-3 py-2 text-[12px] text-[var(--error)]"
            role="alert"
          >
            {error}
          </div>
        ) : null}

        <footer className="flex shrink-0 items-center gap-[10px] border-t border-edge bg-card-2 px-[22px] py-[14px]">
          <button
            type="button"
            onClick={goBack}
            disabled={isFirst || busy}
            className="flex items-center gap-[7px] rounded-xl px-[14px] py-[9px] text-[12.5px] font-bold text-txt-2 transition-colors hover:text-txt disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Icon name="chevron" size={13} className="rotate-180" />
            {t("common.back")}
          </button>
          <div className="flex-1" />
          <span className="font-mono text-[10.5px] text-txt-4">
            {t("first_run.step_counter", { current: stepIdx + 1, total: STEP_ORDER.length })}
          </span>
          {!isLast ? (
            <Button
              variant="primary"
              onClick={goNext}
              disabled={busy}
              className="h-auto gap-[8px] rounded-xl px-[18px] py-[9px] text-[12.5px]"
            >
              {t("common.next")}
              <Icon name="chevron" size={13} />
            </Button>
          ) : (
            <Button
              variant="primary"
              onClick={onFinish}
              disabled={busy}
              className="h-auto gap-[8px] rounded-xl px-[18px] py-[9px] text-[12.5px]"
            >
              {busy ? t("first_run.finishing") : t("first_run.finish")}
              <Icon name="chevron" size={13} />
            </Button>
          )}
        </footer>
      </div>
    </div>
  );
}
