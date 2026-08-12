"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@agent-office/domain/hooks/api";
import { queryKeys } from "@agent-office/domain/hooks/query-keys";
import { API_ROUTES } from "@agent-office/domain/config/routes";
import type { AppSettings, ScannedEntry, Project, HealthInfo } from "@agent-office/domain/types";
import { Button } from "@/components/ui/button";
import { useActiveProjectStore } from "@/lib/active-project-store";
import { cn } from "@/lib/cn";
import { RequirementsStep } from "./first-run-wizard-steps/requirements-step";
import { RootStep } from "./first-run-wizard-steps/root-step";
import { ExcludedStep } from "./first-run-wizard-steps/excluded-step";
import { AgentsStep } from "./first-run-wizard-steps/agents-step";
import { ProjectStep } from "./first-run-wizard-steps/project-step";

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
}

type Step = "requirements" | "root" | "excluded" | "agents" | "project";
const STEP_ORDER: Step[] = ["requirements", "root", "excluded", "agents", "project"];

interface WizardDraft {
  step: Step;
  root: string;
  excluded: string[];
  selectedAgents: string[];
  chosenFolderIds: string[];
  projectName: string;
}

function loadDraft(): WizardDraft | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as WizardDraft;
  } catch {
    return null;
  }
}

function saveDraft(draft: WizardDraft) {
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
  } catch {
    /* storage full or unavailable — not fatal */
  }
}

function clearDraft() {
  try {
    localStorage.removeItem(DRAFT_KEY);
  } catch {
    /* ignore */
  }
}

export function FirstRunWizard({ onDone }: { onDone: () => void }) {
  const t = useTranslations();
  const qc = useQueryClient();
  const setActiveProjectId = useActiveProjectStore((s) => s.setId);

  const draft = useMemo(() => loadDraft(), []);

  const [step, setStep] = useState<Step>(draft?.step ?? "requirements");
  const [root, setRoot] = useState(draft?.root ?? HOME_FALLBACK);
  const [excluded, setExcluded] = useState<string[]>(draft?.excluded ?? DEFAULT_EXCLUDED);
  const [excludedInput, setExcludedInput] = useState("");
  const [selectedAgents, setSelectedAgents] = useState<Set<string>>(
    draft?.selectedAgents ? new Set(draft.selectedAgents) : new Set(),
  );
  const [chosenFolderIds, setChosenFolderIds] = useState<Set<string>>(
    draft?.chosenFolderIds ? new Set(draft.chosenFolderIds) : new Set(),
  );
  const [projectName, setProjectName] = useState(draft?.projectName ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState(false);

  // Persist draft after every meaningful state change.
  useEffect(() => {
    saveDraft({
      step,
      root,
      excluded,
      selectedAgents: [...selectedAgents],
      chosenFolderIds: [...chosenFolderIds],
      projectName,
    });
  }, [step, root, excluded, selectedAgents, chosenFolderIds, projectName]);

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
  useEffect(() => {
    if (starter.length > 0 && selectedAgents.size === 0 && !draft?.selectedAgents) {
      setSelectedAgents(new Set(starter.map((a) => a.id)));
    }
  }, [starter, selectedAgents.size, draft?.selectedAgents]);

  const scanParams = useMemo(() => {
    const p = new URLSearchParams();
    p.set("root", root);
    if (excluded.length > 0) p.set("excluded", excluded.join(","));
    p.set("includeExcluded", "0");
    return p.toString();
  }, [root, excluded]);

  const scanQ = useQuery({
    queryKey: ["wizard-scan", root, excluded.join(",")],
    queryFn: () => apiFetch<ScannedEntry[]>(`${API_ROUTES.settingsScan}?${scanParams}`),
    enabled: step === "project" && root.length > 0,
  });
  const candidates = scanQ.data ?? [];

  const finishMut = useMutation({
    mutationFn: async () => {
      await apiFetch<AppSettings>(API_ROUTES.settings, {
        method: "PUT",
        body: { projectsRoot: root.trim(), excluded },
      });

      if (selectedAgents.size > 0) {
        await apiFetch<{ imported: number }>("/api/starter/agents", {
          method: "POST",
          body: { agentIds: [...selectedAgents] },
        });
      }

      // Create all selected projects. Custom name only applies when exactly one is chosen.
      const chosen = candidates.filter((c) => chosenFolderIds.has(c.id));
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
      className="fixed inset-0 flex items-center justify-center z-[9999] p-[24px] [backdrop-filter:blur(8px)] bg-[rgba(0,0,0,0.72)]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="fr-title"
    >
      <div
        className="flex flex-col overflow-hidden border border-line-2 rounded-[8px] w-[min(720px,100%)] max-h-[90vh] bg-[var(--bg-elev)] shadow-[0_24px_60px_rgba(0,0,0,0.45),_0_4px_12px_rgba(0,0,0,0.25)]"
      >
        <header className="border-b border-line-2 px-[24px] pt-[20px] pb-[12px]">
          <h2 id="fr-title" className="font-semibold m-0 mb-[4px] text-[18px]">{t("first_run.title")}</h2>
          <p className="text-txt-3 m-0 text-[13px]">{t("first_run.subtitle")}</p>
          <ol className="flex list-none uppercase text-txt-3 pt-[14px] m-0 gap-[6px] font-[var(--font-mono)] text-[11px] tracking-[0.06em]">
            {STEP_ORDER.map((s, i) => {
              const isActive = i === stepIdx;
              const isPast = i < stepIdx;
              return (
                <li key={s}>
                  <button
                    type="button"
                    onClick={() => jumpTo(s)}
                    disabled={!isPast}
                    className={cn(
                      "inline-flex items-center border border-line rounded-full gap-[6px] px-[10px] py-[4px] bg-transparent",
                      isActive && "text-acc [border-color:var(--acc)]",
                      isPast && "text-txt-2 cursor-pointer hover:border-acc hover:text-acc transition-colors",
                      !isActive && !isPast && "text-txt-3 cursor-default",
                    )}
                  >
                    <span className={cn(
                      "inline-flex items-center justify-center rounded-full w-[18px] h-[18px] text-[10px]",
                      isActive ? "bg-acc text-white" : isPast ? "bg-acc-faint text-acc" : "bg-bg-2 text-txt-3",
                    )}>
                      {i + 1}
                    </span>
                    {t(`first_run.step_${s}`)}
                  </button>
                </li>
              );
            })}
          </ol>
        </header>

        <div className="overflow-y-auto flex-1 px-[24px] py-[18px]">
          {step === "requirements" ? (
            <RequirementsStep health={healthQ.data} loading={healthQ.isLoading} />
          ) : null}

          {step === "root" ? (
            <RootStep root={root} onRootChange={setRoot} placeholder={HOME_FALLBACK} />
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
              candidates={candidates}
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
            className="mx-[24px] px-[12px] py-[8px] rounded-[6px] text-[12px] bg-[rgba(239,68,68,0.1)] border border-[var(--error)] text-[var(--error)]"
            role="alert"
          >
            {error}
          </div>
        ) : null}

        <footer className="border-t border-line-2 flex items-center px-[24px] py-[14px] gap-[8px]">
          <Button
            variant="ghost"
            onClick={goBack}
            disabled={isFirst || busy}
          >
            {t("common.back")}
          </Button>
          <div className="flex-1" />
          {!isLast ? (
            <Button variant="primary" onClick={goNext} disabled={busy}>
              {t("common.next")}
            </Button>
          ) : (
            <Button variant="primary" onClick={onFinish} disabled={busy}>
              {busy ? t("first_run.finishing") : t("first_run.finish")}
            </Button>
          )}
        </footer>
      </div>
    </div>
  );
}
