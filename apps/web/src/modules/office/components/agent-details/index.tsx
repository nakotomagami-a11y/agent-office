"use client";

import { useEffect, useRef, useState } from "react";
import { Portal } from "@/components/ui/portal";
import { useOfficeAgents } from "../../hooks/use-office-agents";
import { useOfficeStore, type AgentTab } from "../../hooks/use-office-store";
import { ChatPanel } from "@/modules/summon/components/chat-panel";
import { BackgroundTaskPill, useIsBackgroundTaskExpired, type BackgroundTask } from "@/modules/summon/components/background-task-indicator";
import { transcriptKey } from "@/modules/summon/format/transcript-store";
import { useRuns } from "@/modules/runs/hooks/use-runs";
import { useRunStream } from "@/modules/summon/hooks/use-run-stream";
import { AgentEditorForm } from "@/modules/agents/components/agent-editor-form";
import { ContextCostTab } from "./context-cost-tab";
import { Icon } from "@/components/ui/icon";
import { Tooltip } from "@/components/ui/tooltip";
import { useActiveProjectStore } from "@/lib/active-project-store";
import { useRegisterModal } from "@/lib/modal-manager";
import { CHROME_TOP, CHROME_LEFT_CLASS } from "@/lib/chrome";
import { useProject, useAddInstance, useRemoveInstance, useUpdateInstance } from "@/modules/projects/hooks/use-projects";
import { useAgent, useAgentBody, useWriteAgent } from "@/modules/agents/hooks/use-agents";
import { fromApi, toBody } from "@/modules/agents/form/agent-form";
import { MODEL_OPTS, EFFORT_OPTS } from "@agent-office/domain";
import { DropdownMenu } from "@/components/ui/dropdown-menu";
import { toast } from "@/lib/toast-store";
import { UnitSprite } from "@/components/ui/unit-sprite";
import { ProjectActionsMenu } from "../office-toolbar";
import { agentDisplayName } from "@/lib/agent-display-name";
import type { AgentInstance } from "@agent-office/domain/types";
import { statusFromRuns, statusFromRunsForInstance } from "../../derive/derive-status";
import { cn } from "@/lib/cn";

type Tab = AgentTab;

const TABS: { id: Tab; label: string }[] = [
  { id: "conversation", label: "Conversation" },
  { id: "context-cost", label: "Context & Cost" },
  { id: "customization", label: "Customization" },
];

/** Row label for the model/effort dropdowns — check marks the current value. */
function runtimeItemLabel(value: string, selected: boolean) {
  return (
    <span className="flex items-center gap-[8px] font-mono">
      <Icon name="check" size={12} className={cn("shrink-0", selected ? "opacity-100 text-white" : "opacity-0")} />
      <span>{value}</span>
    </span>
  );
}

// ── Main modal ─────────────────────────────────────────────────────────────

export function AgentDetailsModal() {
  const selectedId = useOfficeStore((s) => s.selectedId);
  const selectedInstanceId = useOfficeStore((s) => s.selectedInstanceId);
  const inspectorOpen = useOfficeStore((s) => s.inspectorOpen);
  const closeInspector = useOfficeStore((s) => s.closeInspector);
  const setActiveTab = useOfficeStore((s) => s.setActiveTab);
  const activeProjectId = useActiveProjectStore((s) => s.id);
  const consumePendingTab = useOfficeStore((s) => s.consumePendingTab);
  const selectAgent = useOfficeStore((s) => s.select);

  // Single-active-modal: opening any other modal closes this, and vice versa.
  useRegisterModal(inspectorOpen, closeInspector);

  const { agents } = useOfficeAgents();
  const agent = selectedId ? agents.find((a) => a.id === selectedId) ?? null : null;

  const projectQ = useProject(activeProjectId);
  const rosterInstances = projectQ.data?.meta.roster ?? [];

  // Instances for the currently selected agent
  const agentInstances = rosterInstances.filter(
    (i) => i.agentId === selectedId,
  );
  // Instance-switching UI (arrows, breadcrumb, overview) only needs multiple
  // instances to exist — it's not gated behind the multiInstance feature
  // flag, which merely controls whether new instances get their own git
  // worktree. Instances can already be created via "+ New" regardless of
  // that flag, so hiding the switcher behind it stranded users with no way
  // to navigate between sessions they'd already created.
  const isMultiAgentSelected = agentInstances.length > 1;

  const addMut = useAddInstance();
  const removeMut = useRemoveInstance();
  const updateInstanceMut = useUpdateInstance();
  const [confirmDeleteInstance, setConfirmDeleteInstance] = useState(false);

  // Cancel any pending delete confirm when switching instance/agent
  useEffect(() => {
    setConfirmDeleteInstance(false);
  }, [selectedId, selectedInstanceId]);

  const [tab, setTab] = useState<Tab>("conversation");
  const changeTab = (t: Tab) => { setTab(t); setActiveTab(t); };
  const [newThreadSignal, setNewThreadSignal] = useState(0);

  const handleNewConversation = async () => {
    if (!activeProjectId || !selectedId) {
      setNewThreadSignal((n) => n + 1);
      return;
    }
    try {
      const data = await new Promise<{ instance: AgentInstance }>((resolve, reject) => {
        addMut.mutate({ projectId: activeProjectId, agentId: selectedId }, {
          onSuccess: (d) => resolve(d),
          onError: reject,
        });
      });
      selectAgent(selectedId, { instanceId: data.instance.instanceId, tab: "conversation" });
    } catch {
      setNewThreadSignal((n) => n + 1);
    }
  };

  // Runs scoped to this project only — an agent busy on another project must
  // not read as active here.
  const projectRunsQ = useRuns({ projectId: activeProjectId ?? undefined, limit: 100 });
  const projectStatus = (agentId: string) =>
    activeProjectId
      ? statusFromRuns(agentId, projectRunsQ.data ?? []).status
      : "idle";

  // Track active run id to show live usage in header
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const stream = useRunStream(activeRunId);
  const [backgroundTask, setBackgroundTask] = useState<BackgroundTask | null>(null);
  const [dismissedBgTaskId, setDismissedBgTaskId] = useState<string | null>(null);
  const backgroundTaskExpired = useIsBackgroundTaskExpired(backgroundTask?.startedAt);

  // Runtime (model / effort) dropdowns in the header. Editing these writes the
  // agent definition, which only takes effect on the next task — hence the toast.
  const agentDetailQ = useAgent(selectedId);
  const agentBodyQ = useAgentBody(selectedId);
  const writeAgentMut = useWriteAgent();
  // Customization tab reuses the same AgentEditorForm as `/agents/new` and
  // `/agents/[id]/edit` — single source of truth for "edit an agent" instead
  // of a fourth bespoke reimplementation.
  const customizationInitial =
    agentDetailQ.data && agentBodyQ.data !== undefined
      ? fromApi(agentDetailQ.data, agentBodyQ.data)
      : null;
  const applyRuntime = async (patch: { model?: string; effort?: string }) => {
    // Guard against clobbering the body before it has loaded.
    if (!agentDetailQ.data || agentBodyQ.data === undefined) return;
    const values = fromApi(agentDetailQ.data, agentBodyQ.data);
    await writeAgentMut.mutateAsync(toBody({ ...values, ...patch }));
    toast(
      patch.model
        ? `Model set to ${patch.model} — applies on next task`
        : `Effort set to ${patch.effort} — applies on next task`,
    );
  };

  // Per-instance Playwright toggle. Unlike model/effort above (which edit the
  // agent definition), this writes the instance override so it only affects
  // this session. Disabling it keeps the Playwright MCP server out of the spawn
  // entirely — no tool schemas in context, and sub-agents can't reach it either.
  const agentDeclaresPlaywright = (agentDetailQ.data?.tools ?? []).some((t) =>
    t.startsWith("mcp__playwright"),
  );
  const currentInstanceForToggle =
    agentInstances.find((i) => i.instanceId === selectedInstanceId) ?? null;
  const playwrightEnabled = currentInstanceForToggle?.playwrightEnabled !== false;
  const togglePlaywright = () => {
    if (!activeProjectId || !selectedInstanceId) return;
    const next = !playwrightEnabled;
    updateInstanceMut.mutate(
      { projectId: activeProjectId, instanceId: selectedInstanceId, patch: { playwrightEnabled: next } },
      {
        onSuccess: () =>
          toast(
            next
              ? "Playwright enabled for this session — applies on next task"
              : "Playwright disabled for this session — applies on next task",
          ),
      },
    );
  };

  useEffect(() => {
    if (inspectorOpen) {
      const pending = consumePendingTab();
      changeTab(pending ?? "conversation");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- changeTab is stable across renders
  }, [inspectorOpen, selectedId, consumePendingTab]);

  // Close on Escape
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!inspectorOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeInspector();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [inspectorOpen, closeInspector]);

  // ── Alt+← / Alt+→ keyboard navigation between instances ──────
  useEffect(() => {
    if (!inspectorOpen || !isMultiAgentSelected) return;
    const onKey = (e: KeyboardEvent) => {
      // Skip when a text input / textarea / contenteditable is focused
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if ((e.target as HTMLElement)?.isContentEditable) return;

      if (!e.altKey) return;
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;

      e.preventDefault();
      const currentIdx = agentInstances.findIndex(
        (i) => i.instanceId === selectedInstanceId,
      );
      if (currentIdx === -1) return;
      const dir = e.key === "ArrowRight" ? 1 : -1;
      const nextIdx =
        (currentIdx + dir + agentInstances.length) % agentInstances.length;
      const nextInst = agentInstances[nextIdx];
      if (nextInst) {
        selectAgent(selectedId!, { instanceId: nextInst.instanceId, tab });
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [
    inspectorOpen,
    isMultiAgentSelected,
    agentInstances,
    selectedInstanceId,
    selectedId,
    selectAgent,
    tab,
  ]);

  if (!inspectorOpen || !agent) return null;

  const isStreamActive =
    stream.phase === "starting" ||
    stream.phase === "streaming";
  // Header status is for the *selected instance*, not the agent as a whole —
  // statusFromRuns aggregates every instance of this agent, so a second,
  // brand-new instance would read as "live" just because instance #1 happens
  // to be running. statusFromRunsForInstance scopes it to the one you're
  // actually looking at (falls back to the agent-wide status when there's no
  // instance concept, e.g. project-less agents).
  const instanceStatus =
    selectedInstanceId && activeProjectId
      ? statusFromRunsForInstance(selectedInstanceId, projectRunsQ.data ?? []).status
      : projectStatus(agent.id);
  const effectiveStatus = isStreamActive ? "working" : instanceStatus;

  const isWorking = effectiveStatus === "working" || effectiveStatus === "thinking";

  // Status shown inline with the agent name in the header: a plain dot at
  // rest, a full "live" pill (background + label) when actually working —
  // matching the reference design, which only calls out the active state
  // rather than badging idle as if it were equally noteworthy.
  const statusDot = isWorking ? (
    <span className="inline-flex items-center gap-[6px] shrink-0 h-[22px] pl-[8px] pr-[10px] rounded-full bg-[color-mix(in_srgb,var(--ao-ok)_16%,transparent)] text-[var(--ao-ok)] text-[12px] font-semibold">
      <span className="w-[6px] h-[6px] rounded-full bg-[var(--ao-ok)] shadow-[0_0_6px_var(--ao-ok)] animate-[ao-pulse_1.5s_infinite]" aria-hidden />
      live
    </span>
  ) : (
    <span
      className="inline-block w-[9px] h-[9px] rounded-full shrink-0 bg-[var(--ao-fg-3)]"
      title="idle"
      aria-hidden
    />
  );

  // usage stream reserved for future use

  // Breadcrumb: instance index + label for the currently selected instance
  const selectedInstIdx = isMultiAgentSelected
    ? agentInstances.findIndex((i) => i.instanceId === selectedInstanceId)
    : -1;
  const selectedInst =
    selectedInstIdx >= 0 ? agentInstances[selectedInstIdx] : null;
  // Git branch for the current instance's worktree, when one exists — real
  // data lifted straight off AgentInstance.worktree, never fabricated.
  const currentInstance =
    agentInstances.find((i) => i.instanceId === selectedInstanceId) ?? agentInstances[0] ?? null;
  const branchLabel = currentInstance?.worktree?.branch;

  return (
    <Portal>
      <div
        className={cn(
          "app-modal-backdrop fixed top-0 right-0 bottom-0 flex items-center justify-center z-[200] p-[26px] before:[backdrop-filter:blur(12px)_saturate(0.9)] before:[-webkit-backdrop-filter:blur(12px)_saturate(0.9)]",
          CHROME_LEFT_CLASS,
        )}
        role="presentation"
        onClick={closeInspector}
        style={{ top: CHROME_TOP }}
      >
        <div
          ref={ref}
          className="ao-modal surface-sheen relative w-full max-w-[1240px] rounded-[26px] shadow-[var(--ao-shadow-modal)] flex flex-col overflow-hidden z-[1] text-[var(--ao-fg-0)] text-[14px] leading-[1.45] [-webkit-font-smoothing:antialiased]"
          style={{ height: `calc(100vh - ${CHROME_TOP + 52}px)`, maxHeight: "940px" }}
          role="dialog"
          aria-modal="true"
          aria-label={`Agent: ${agent.name}`}
          onClick={(e) => e.stopPropagation()}
        >
          {/* ── Tab bar ── */}
          <div className="flex items-stretch px-2 border-b border-ao-line-0 bg-gradient-to-b from-white/[0.02] to-transparent h-[var(--ao-tab-h)] shrink-0 relative" role="tablist">
            {TABS.map((t) => (
              <button
                key={t.id}
                role="tab"
                aria-selected={tab === t.id}
                className={`relative inline-flex items-center gap-2 px-[18px] h-full text-[13px] font-medium tracking-[0.01em] whitespace-nowrap transition-colors duration-[120ms] ${tab === t.id ? "text-[var(--ao-fg-0)] font-semibold" : "text-[var(--ao-fg-2)] hover:text-[var(--ao-fg-1)]"}`}
                onClick={() => changeTab(t.id)}
                type="button"
              >
                <span>{t.label}</span>
                {tab === t.id && (
                  <span className="absolute left-3 right-3 bottom-[-1px] h-[2px] bg-[var(--ao-accent)] rounded-[2px]" />
                )}
              </button>
            ))}
            <div className="flex-1" />
            <Tooltip content="Close (Esc)" side="bottom" delayMs={600}>
              <button
                className="inline-flex items-center justify-center w-8 h-8 my-auto mr-1 rounded-lg text-ao-fg-2 hover:text-ao-fg-0 hover:bg-ao-bg-3"
                aria-label="Close"
                onClick={closeInspector}
                type="button"
              >
                <Icon name="x" size={18} />
              </button>
            </Tooltip>
          </div>

          {/* ── Body row ── */}
          <div className="flex flex-row flex-1 min-h-0 overflow-hidden">
          <div className="flex flex-col flex-1 min-w-0 overflow-hidden">

          {/* ── Agent header ── */}
          <div className="flex items-center gap-[14px] px-6 h-[84px] border-b border-ao-line-0 bg-gradient-to-b from-white/[0.015] to-transparent shrink-0">
            <div className="relative shrink-0 w-[40px] h-[70px] flex items-center justify-center">
              <UnitSprite unit={agent.unitChoice} size={70} label={agent.name} animate action={isWorking ? "attack" : "idle"} />
            </div>
            <div className="flex flex-col gap-0.5 min-w-0">
              {/* Agent name is always the primary heading — session/label is
                  secondary metadata after it, never the other way round. */}
              <div className="flex items-center gap-[7px] min-w-0">
                <span className="font-bold text-base text-ao-fg-0 truncate shrink-0">{agentDisplayName(agent)}</span>
                {isMultiAgentSelected && selectedInst && (
                  <>
                    <span className="text-ao-fg-3 shrink-0" aria-hidden>/</span>
                    <span className="text-ao-fg-2 text-[13px] truncate max-w-[160px]">
                      Session {selectedInstIdx + 1}
                    </span>
                    {selectedInst.label && (
                      <>
                        <span className="text-ao-fg-3 shrink-0" aria-hidden>·</span>
                        <span className="text-ao-fg-2 text-[13px] truncate">{selectedInst.label}</span>
                      </>
                    )}
                  </>
                )}
                {statusDot}
              </div>
              <div className="flex items-center gap-[7px] text-ao-fg-2 font-mono text-[12px]">
                <DropdownMenu
                  align="start"
                  ariaLabel="Model"
                  triggerClassName="!h-[24px] !px-[10px] !rounded-[9px] !text-[11.5px] !font-mono !font-semibold !text-ao-fg-2 !bg-ao-bg-2 !shadow-[inset_0_0_0_1px_var(--ao-line-0)] hover:!shadow-[inset_0_0_0_1px_var(--ao-line-1)] hover:!text-ao-fg-0"
                  trigger={
                    <span className="flex items-center gap-[6px]">
                      <span className="w-[6px] h-[6px] rounded-full shrink-0 bg-[var(--ao-accent)]" aria-hidden />
                      <span>{agent.defaultModel ?? "default"}</span>
                      <Icon name="chevron-down" size={11} className="shrink-0 text-ao-fg-3" />
                    </span>
                  }
                  items={MODEL_OPTS.map((m) => ({
                    key: m,
                    label: runtimeItemLabel(m, (agent.defaultModel ?? "") === m),
                    selected: (agent.defaultModel ?? "") === m,
                    onSelect: () => void applyRuntime({ model: m }),
                  }))}
                />
                <DropdownMenu
                  align="start"
                  ariaLabel="Effort"
                  triggerClassName="!h-[24px] !px-[10px] !rounded-[9px] !text-[11.5px] !font-mono !font-semibold !text-ao-fg-2 !bg-ao-bg-2 !shadow-[inset_0_0_0_1px_var(--ao-line-0)] hover:!shadow-[inset_0_0_0_1px_var(--ao-line-1)] hover:!text-ao-fg-0"
                  trigger={
                    <span className="flex items-center gap-[6px]">
                      <span className="w-[6px] h-[6px] rounded-full shrink-0 bg-[var(--cyan)]" aria-hidden />
                      <span>effort {agent.defaultEffort ?? "default"}</span>
                      <Icon name="chevron-down" size={11} className="shrink-0 text-ao-fg-3" />
                    </span>
                  }
                  items={EFFORT_OPTS.map((e) => ({
                    key: e,
                    label: runtimeItemLabel(e, (agent.defaultEffort ?? "") === e),
                    selected: (agent.defaultEffort ?? "") === e,
                    onSelect: () => void applyRuntime({ effort: e }),
                  }))}
                />
                {activeProjectId && selectedInstanceId && agentDeclaresPlaywright && (
                  <Tooltip
                    content={
                      playwrightEnabled
                        ? "Playwright is available to this session. Click to turn it off — its browser tools won't load into context and sub-agents can't use it either."
                        : "Playwright is off for this session. Click to turn it back on."
                    }
                    side="bottom"
                    delayMs={400}
                  >
                    <button
                      type="button"
                      aria-pressed={playwrightEnabled}
                      onClick={togglePlaywright}
                      disabled={updateInstanceMut.isPending}
                      className={cn(
                        "inline-flex items-center gap-[6px] h-[24px] px-[10px] rounded-[9px] font-mono text-[11.5px] font-semibold transition-colors duration-[120ms] disabled:opacity-50",
                        playwrightEnabled
                          ? "text-ao-fg-2 bg-ao-bg-2 shadow-[inset_0_0_0_1px_var(--ao-line-0)] hover:text-ao-fg-0 hover:shadow-[inset_0_0_0_1px_var(--ao-line-1)]"
                          : "text-[var(--ao-fg-3)] bg-transparent shadow-[inset_0_0_0_1px_var(--ao-line-0)] hover:text-ao-fg-1",
                      )}
                    >
                      <span
                        className={cn(
                          "w-[6px] h-[6px] rounded-full shrink-0",
                          playwrightEnabled ? "bg-[var(--ao-ok)] shadow-[0_0_5px_var(--ao-ok)]" : "bg-[var(--ao-fg-3)]",
                        )}
                        aria-hidden
                      />
                      <span>playwright {playwrightEnabled ? "on" : "off"}</span>
                    </button>
                  </Tooltip>
                )}
                {branchLabel && (
                  <span className="text-ao-fg-3 truncate max-w-[220px]" title={branchLabel}>
                    {branchLabel}
                  </span>
                )}
              </div>
            </div>
            <div className="ml-auto flex items-center gap-2">
              {tab === "conversation" && backgroundTask && backgroundTask.id !== dismissedBgTaskId && !backgroundTaskExpired && (
                <BackgroundTaskPill task={backgroundTask} onDismiss={() => setDismissedBgTaskId(backgroundTask.id)} />
              )}
              {/* Alt+← / Alt+→ navigator when multi-instance */}
              {isMultiAgentSelected && (
                <div className="flex items-center gap-[1px] p-[3px] mr-1 rounded-[12px] bg-ao-bg-2 shadow-[inset_0_0_0_1px_var(--ao-line-0)]">
                  <Tooltip content="Previous (Alt+←)" side="bottom">
                    <button
                      type="button"
                      aria-label="Previous instance (Alt+←)"
                      onClick={() => {
                        const ci = agentInstances.findIndex((i) => i.instanceId === selectedInstanceId);
                        const ni = (ci - 1 + agentInstances.length) % agentInstances.length;
                        const next = agentInstances[ni];
                        if (next) { selectAgent(selectedId!, { instanceId: next.instanceId, tab }); }
                      }}
                      className="inline-flex items-center justify-center w-[26px] h-[26px] rounded-[9px] text-ao-fg-3 hover:text-ao-fg-0 hover:bg-ao-bg-3 transition-all duration-[120ms]"
                    >
                      <span className="rotate-180 inline-flex"><Icon name="chevron" size={12} /></span>
                    </button>
                  </Tooltip>
                  <span className="font-mono text-[11px] font-semibold text-ao-fg-2 min-w-[30px] text-center">
                    {selectedInstIdx + 1}/{agentInstances.length}
                  </span>
                  <Tooltip content="Next (Alt+→)" side="bottom">
                    <button
                      type="button"
                      aria-label="Next instance (Alt+→)"
                      onClick={() => {
                        const ci = agentInstances.findIndex((i) => i.instanceId === selectedInstanceId);
                        const ni = (ci + 1) % agentInstances.length;
                        const next = agentInstances[ni];
                        if (next) { selectAgent(selectedId!, { instanceId: next.instanceId, tab }); }
                      }}
                      className="inline-flex items-center justify-center w-[26px] h-[26px] rounded-[9px] text-ao-fg-3 hover:text-ao-fg-0 hover:bg-ao-bg-3 transition-all duration-[120ms]"
                    >
                      <Icon name="chevron" size={12} />
                    </button>
                  </Tooltip>
                </div>
              )}
              {tab === "conversation" && (
                <button
                  type="button"
                  className="inline-flex items-center gap-[6px] h-7 px-[12px] rounded-lg text-white text-[13px] font-semibold transition-transform duration-[120ms] hover:-translate-y-px disabled:opacity-40 disabled:cursor-default disabled:hover:translate-y-0"
                  style={{ background: "linear-gradient(120deg,var(--acc),var(--acc-2))", boxShadow: "0 10px 22px -12px color-mix(in srgb, var(--acc) 80%, transparent)" }}
                  onClick={() => void handleNewConversation()}
                  disabled={addMut.isPending}
                >
                  <Icon name="plus" size={13} /> New
                </button>
              )}
              {/* Project actions kebab — folder / VS Code / cache / build / dev servers */}
              {activeProjectId && <ProjectActionsMenu projectId={activeProjectId} />}
              {activeProjectId && selectedInstanceId && (
                confirmDeleteInstance ? (
                  <span className="inline-flex items-center gap-[6px] h-7 pl-[10px] pr-1 rounded-lg bg-[var(--ao-bad-soft)] border border-[rgba(217,83,79,0.30)] text-[var(--ao-bad)] text-[12.5px]">
                    <span className="font-mono">delete this instance?</span>
                    <button
                      type="button"
                      className="inline-flex items-center gap-[4px] h-[22px] px-[8px] rounded-md bg-[var(--ao-bad)] text-white font-semibold text-[11.5px] hover:brightness-110 disabled:opacity-50"
                      disabled={removeMut.isPending}
                      onClick={() => {
                        removeMut.mutate(
                          { projectId: activeProjectId, instanceId: selectedInstanceId },
                          {
                            onSuccess: () => {
                              setConfirmDeleteInstance(false);
                              closeInspector();
                            },
                          }
                        );
                      }}
                    >
                      <Icon name="trash" size={11} /> delete
                    </button>
                    <button
                      type="button"
                      className="inline-flex items-center h-[22px] px-[8px] rounded-md text-[var(--ao-fg-1)] text-[11.5px] hover:bg-white/[0.05]"
                      onClick={() => setConfirmDeleteInstance(false)}
                    >
                      cancel
                    </button>
                  </span>
                ) : (
                  <Tooltip content="Delete this instance" side="bottom" delayMs={400}>
                    <button
                      type="button"
                      aria-label="Delete this agent instance"
                      className="inline-flex items-center justify-center w-[34px] h-[34px] rounded-[12px] text-ao-fg-3 hover:text-[var(--ao-bad)] hover:bg-[var(--ao-bad-soft)] border border-transparent hover:border-[rgba(217,83,79,0.25)] transition-all duration-[120ms] disabled:opacity-40"
                      disabled={removeMut.isPending}
                      onClick={() => setConfirmDeleteInstance(true)}
                    >
                      <Icon name="trash" size={15} />
                    </button>
                  </Tooltip>
                )
              )}
            </div>
          </div>

          {/* ── Tab content ── */}
          <div className="ao-modal-body flex-1 min-h-0 overflow-y-auto overflow-x-hidden [scrollbar-color:var(--ao-bg-4)_transparent] [scrollbar-width:thin] relative flex flex-col">
            {tab === "conversation" && (
              <ChatPanel
                key={transcriptKey(agent.id, selectedInstanceId)}
                agent={agent}
                projectId={activeProjectId ?? undefined}
                instanceId={selectedInstanceId ?? undefined}
                onClose={closeInspector}
                onEdit={() => changeTab("customization")}
                noHeader
                newThreadSignal={newThreadSignal}
                onActiveRunChange={setActiveRunId}
                onBackgroundTaskChange={setBackgroundTask}
              />
            )}
            {tab === "context-cost" && (
              <ContextCostTab
                agentId={agent.id}
                instanceId={selectedInstanceId ?? undefined}
                projectId={activeProjectId ?? undefined}
              />
            )}
            {tab === "customization" && (
              customizationInitial ? (
                <AgentEditorForm
                  key={agent.id}
                  mode="edit"
                  initial={customizationInitial}
                  embedded
                  onSaved={() => {}}
                  onDeleted={closeInspector}
                />
              ) : null
            )}
          </div>

          </div>{/* content-col */}
          </div>{/* body-row */}
        </div>
      </div>
    </Portal>
  );
}
