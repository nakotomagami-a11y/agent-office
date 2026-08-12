"use client";

import { useCallback, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { AgentAvatar } from "@/components/ui/agent-avatar";
import { Tooltip } from "@/components/ui/tooltip";
import { Icon } from "@/components/ui/icon";
import { formatAgentDisplayName } from "@/lib/agent-display-name";
import { statusFromRunsForInstance, type AgentStatusInfo } from "../../derive/derive-status";
import type { OfficeAgent } from "../../hooks/use-office-agents";
import type { AgentInstance, PersistedRun } from "@agent-office/domain/types";

const LIVE: AgentStatusInfo["status"][] = ["working", "thinking"];
const GAP = 10;

type SelectFn = (agentId: string, instanceId: string | null) => void;

export function AgentStrip({
  agents,
  instances,
  runs,
  pinnedIds,
  selectedId,
  selectedInstanceId,
  isStreamActive,
  agentStatus,
  onSelect,
}: {
  agents: OfficeAgent[];
  instances: AgentInstance[];
  runs: PersistedRun[];
  pinnedIds: string[];
  selectedId: string | null;
  selectedInstanceId: string | null;
  isStreamActive: boolean;
  agentStatus: (agentId: string) => AgentStatusInfo["status"];
  onSelect: SelectFn;
}) {
  return (
    <div className="ao-agent-strip flex flex-col items-center gap-1 py-[10px] w-[52px] shrink-0 border-r border-[var(--ao-line-0)] overflow-y-auto [scrollbar-width:none]">
      {agents.map((a) => (
        <StripBubble
          key={a.id}
          agent={a}
          instances={instances.filter((i) => i.agentId === a.id)}
          runs={runs}
          pinned={pinnedIds.includes(a.id)}
          isActive={a.id === selectedId}
          selectedInstanceId={selectedInstanceId}
          live={(a.id === selectedId && isStreamActive) || LIVE.includes(agentStatus(a.id))}
          onSelect={onSelect}
        />
      ))}
    </div>
  );
}

function statusDotClass(status: AgentStatusInfo["status"]) {
  if (LIVE.includes(status)) return "bg-[var(--ao-ok)] shadow-[0_0_5px_var(--ao-ok)] animate-[ao-pulse_1.4s_ease-in-out_infinite]";
  if (status === "error") return "bg-[var(--ao-bad)]";
  if (status === "queued" || status === "done") return "bg-[#e6b35a]";
  return "bg-[var(--ao-fg-3)]";
}

function StripBubble({
  agent,
  instances,
  runs,
  pinned,
  isActive,
  selectedInstanceId,
  live,
  onSelect,
}: {
  agent: OfficeAgent;
  instances: AgentInstance[];
  runs: PersistedRun[];
  pinned: boolean;
  isActive: boolean;
  selectedInstanceId: string | null;
  live: boolean;
  onSelect: SelectFn;
}) {
  const multi = instances.length > 1;
  const primary = instances[0];
  const btnRef = useRef<HTMLButtonElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [flyout, setFlyout] = useState<CSSProperties | null>(null);

  const openFlyout = useCallback(() => {
    clearTimeout(timer.current);
    const rect = btnRef.current?.getBoundingClientRect();
    if (rect) {
      setFlyout({ position: "fixed", left: rect.right + GAP, top: rect.top });
    }
  }, []);

  const scheduleClose = useCallback(() => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setFlyout(null), 120);
  }, []);

  const stateClass = isActive
    ? "border-[var(--ao-accent)] bg-[var(--ao-accent-soft)]"
    : pinned
      ? "border-[color-mix(in_oklab,#e6b35a_38%,transparent)] bg-[color-mix(in_oklab,#e6b35a_16%,transparent)] hover:bg-[color-mix(in_oklab,#e6b35a_26%,transparent)]"
      : "border-transparent bg-transparent hover:bg-[var(--ao-bg-2)]";

  const bubble = (
    <button
      ref={btnRef}
      type="button"
      className={`relative w-[38px] h-[38px] rounded-[10px] border-2 cursor-pointer flex items-center justify-center transition-[background,border-color] duration-[120ms] shrink-0 ${stateClass}`}
      onClick={() => onSelect(agent.id, primary?.instanceId ?? null)}
    >
      <AgentAvatar unit={agent.unitChoice} size={30} label={agent.name} />
      {multi && (
        <span className="absolute top-0 right-0 min-w-[14px] h-[14px] px-[3px] rounded-full bg-[var(--ao-bg-3)] border border-[var(--ao-line-1)] text-[var(--ao-fg-1)] text-[9px] font-bold leading-none flex items-center justify-center">
          {instances.length}
        </span>
      )}
      {live && (
        <span className="absolute bottom-[1px] right-[1px] w-2 h-2 rounded-full border-[1.5px] border-[var(--ao-bg-1)] bg-[var(--ao-ok)] animate-[ao-pulse_1.4s_ease-in-out_infinite]" />
      )}
    </button>
  );

  if (!multi) {
    return (
      <Tooltip content={formatAgentDisplayName(agent.name)} side="right" delayMs={300}>
        {bubble}
      </Tooltip>
    );
  }

  return (
    <div className="relative shrink-0" onMouseEnter={openFlyout} onMouseLeave={scheduleClose}>
      {bubble}
      {flyout &&
        createPortal(
          <div
            style={flyout}
            onMouseEnter={() => clearTimeout(timer.current)}
            onMouseLeave={scheduleClose}
            className="z-[9999] min-w-[190px] max-w-[260px] bg-[#1c1714] border border-[rgba(255,255,255,0.09)] rounded-[8px] p-1 shadow-[0_6px_20px_rgba(0,0,0,0.6)] flex flex-col gap-[1px]"
          >
            <div className="px-2 pt-[5px] pb-[3px] text-[10.5px] font-semibold uppercase tracking-[0.04em] text-white/65">
              {formatAgentDisplayName(agent.name)}
            </div>
            {instances.map((inst, i) => {
              const status = statusFromRunsForInstance(inst.instanceId, runs).status;
              const isSel = inst.instanceId === selectedInstanceId;
              return (
                <button
                  key={inst.instanceId}
                  type="button"
                  onClick={() => {
                    onSelect(agent.id, inst.instanceId);
                    setFlyout(null);
                  }}
                  className={`flex items-center gap-2 px-2 py-[6px] rounded-[5px] text-left transition-colors cursor-pointer ${isSel ? "bg-[var(--ao-accent-soft)]" : "hover:bg-white/[0.07]"}`}
                >
                  <span className={`w-2 h-2 rounded-full shrink-0 ${statusDotClass(status)}`} />
                  <span className="font-mono text-[11.5px] text-white/90 shrink-0">#{i + 1}</span>
                  {inst.label && (
                    <span className="text-[12px] text-white/70 truncate">{inst.label}</span>
                  )}
                  {isSel && <Icon name="check" size={11} className="ml-auto text-[var(--ao-accent)] shrink-0" />}
                </button>
              );
            })}
          </div>,
          document.body,
        )}
    </div>
  );
}
