"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Icon } from "@/components/ui/icon";
import { AgentAvatar } from "@/components/ui/agent-avatar";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/lib/cn";
import { ACCENT_BTN } from "@/lib/button-styles";
import { formatAgentDisplayName } from "@/lib/agent-display-name";
import { Button } from "@/components/ui/button";
import { useActiveProjectStore } from "@/lib/active-project-store";
import { AddAgentModal } from "@/modules/projects/components/add-agent-modal";
import { PAGE_ROUTES } from "@agent-office/domain/config/routes";
import type { OfficeAgent } from "../hooks/use-office-agents";
import type { OfficeView } from "../hooks/use-office-store";
import { useProject } from "@/modules/projects/hooks/use-projects";
import { ProjectChip } from "@/modules/projects/components/project-chip";
import { ProjectActionsBar } from "./office-toolbar";

export type OfficeFilter = "all" | "live" | "idle";

export type CardsOfficeProps = {
  agents: OfficeAgent[];
  isLoading: boolean;
  hasProject: boolean;
  selectedId: string | null;
  onSelect: (id: string) => void;
  projectId: string | null;
  projectName: string | null;
  rosterCount: number;
  workingCount: number;
  /**
   * Iso capability + view switching. The in-app iso/cards switch renders only
   * when `canUseIso` (iso enabled in the dev menu AND rendering budget Full);
   * when iso is disabled the dev-menu toggle is the sole control and no switch
   * shows. Optional so callers without iso can omit them.
   */
  view?: OfficeView;
  setView?: (v: OfficeView) => void;
  canUseIso?: boolean;
};

export function CardsOffice({
  agents,
  isLoading,
  hasProject,
  selectedId,
  onSelect,
  view,
  setView,
  canUseIso,
  projectId,
  projectName: _projectName,
  rosterCount,
  workingCount,
}: CardsOfficeProps) {
  const t = useTranslations();
  const [pinned, setPinned] = useState<Set<string>>(new Set());
  const [addOpen, setAddOpen] = useState(false);
  const setActiveId = useActiveProjectStore((s) => s.setId);
  const projectQ = useProject(projectId);


  const togglePin = (id: string) =>
    setPinned(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const liveAgents = agents.filter(a => a.status === "working" || a.status === "thinking" || a.status === "error");
  const idleAgents = agents.filter(a => a.status !== "working" && a.status !== "thinking" && a.status !== "error");

  const sort = (list: OfficeAgent[]) =>
    [...list].sort((a, b) => (pinned.has(b.id) ? 1 : 0) - (pinned.has(a.id) ? 1 : 0));

  function renderBody() {
    if (isLoading) {
      return <CardsOfficeGhostBody />;
    }
    if (hasProject && agents.length === 0) {
      return (
        <EmptyState
          icon="users"
          title={t("office.empty_roster_title")}
          description={t("office.empty_roster_hint")}
          action={
            <Button href={PAGE_ROUTES.project(projectId!)}>
              Add agents
            </Button>
          }
        />
      );
    }
    if (!hasProject && agents.length === 0) {
      return (
        <EmptyState
          icon="users"
          title={t("office.no_project_selected")}
          description={t("office.no_project_hint")}
          action={
            <Button href={PAGE_ROUTES.projects}>
              Open projects
            </Button>
          }
        />
      );
    }

    return (
      <>
        {workingCount > 0 && (
          <div className="flex items-center gap-[12px] border border-[var(--acc-tint)] px-[16px] py-[14px] [background:linear-gradient(90deg,var(--acc-faint),transparent_70%)] rounded-[12px] mb-[18px]">
            <div className="flex items-center justify-center bg-acc-faint text-acc shrink-0 w-8 h-8 rounded-lg border border-[var(--acc-tint)]"><Icon name="activity" size={14} /></div>
            <div className="text-txt-2 flex-1 text-[13.5px]">
              <span className="text-txt font-semibold">{workingCount} agent{workingCount === 1 ? "" : "s"} working</span>
              {" - open one to follow along, or jump to the activity feed."}
            </div>
            <div className="flex gap-2">
              <Link href={PAGE_ROUTES.activity} className="inline-flex items-center gap-[6px] bg-bg-3 border border-line text-txt-2 cursor-pointer px-[10px] py-[6px] rounded-[8px] text-[12.5px] transition-[background,color] duration-[120ms] hover:bg-bg-2 hover:text-txt hover:border-line-2 no-underline">
                <Icon name="activity" size={12} /> Activity
              </Link>
            </div>
          </div>
        )}

        {liveAgents.length > 0 && (
          <>
            <div className="flex items-center gap-[10px] my-[6px] mb-3">
              <h2 className="font-semibold uppercase text-txt-3 flex items-center gap-2 m-0 text-[11.5px] tracking-[0.1em]">
                Live <span className="pip live">{liveAgents.length} working</span>
              </h2>
              <span className="flex-1 h-px bg-line" />
              <span className="text-txt-3 font-mono text-[11px]">now</span>
            </div>
            <div className="flex flex-wrap gap-[14px] [&>*]:grow-0 [&>*]:shrink-0 [&>*]:min-w-0 [&>*]:basis-[calc(33.333%_-_9.34px)] max-[1024px]:[&>*]:basis-[calc(50%_-_7px)] max-[600px]:[&>*]:basis-full mb-[22px]">
              {sort(liveAgents).map(a => (
                <OfficeCard
                  key={a.id}
                  agent={a}
                  selected={selectedId === a.id}
                  pinned={pinned.has(a.id)}
                  onSelect={onSelect}
                  onPin={togglePin}
                />
              ))}
            </div>
          </>
        )}

        {idleAgents.length > 0 && (
          <>
            <div className="flex items-center gap-[10px] my-[6px] mb-3">
              <h2 className="font-semibold uppercase text-txt-3 flex items-center gap-2 m-0 text-[11.5px] tracking-[0.1em]">
                Idle <span className="pip">{idleAgents.length}</span>
              </h2>
              <span className="flex-1 h-px bg-line" />
              <span className="text-txt-3 font-mono text-[11px]">ready when you are</span>
            </div>
            <div className="flex flex-wrap gap-[14px] [&>*]:grow-0 [&>*]:shrink-0 [&>*]:min-w-0 [&>*]:basis-[calc(33.333%_-_9.34px)] max-[1024px]:[&>*]:basis-[calc(50%_-_7px)] max-[600px]:[&>*]:basis-full mb-[22px]">
              {sort(idleAgents).map(a => (
                <OfficeCard
                  key={a.id}
                  agent={a}
                  selected={selectedId === a.id}
                  pinned={pinned.has(a.id)}
                  onSelect={onSelect}
                  onPin={togglePin}
                />
              ))}
              <button type="button" className="add-card bg-transparent flex items-center justify-center text-center border-dashed border border-line min-h-[220px] text-[var(--txt-3)] rounded-[14px] cursor-pointer" onClick={() => setAddOpen(true)}>
                <div>
                  <div className="bg-[var(--acc-faint)] flex items-center justify-center text-[var(--acc)] w-[44px] h-[44px] rounded-[12px] border border-[var(--acc-tint)] mx-auto mb-[10px]"><Icon name="plus" size={18} /></div>
                  <div className="font-semibold text-txt text-[14px]">Add an agent</div>
                  <div className="font-mono text-[11px] text-txt-3 mt-1">
                    summon from your roster
                  </div>
                </div>
              </button>
            </div>
          </>
        )}

      </>
    );
  }

  return (
    <div className="flex flex-col min-h-0 h-full overflow-hidden">
      <header className="border-b border-line shrink-0 flex items-center gap-[16px] px-[28px] pt-[18px] pb-[14px]">
        <div className="flex items-center gap-[14px] min-w-0">
          <h1 className="font-bold m-0 text-[22px] tracking-[-0.01em] shrink-0">The office</h1>
          {projectId ? (
            <>
              <span className="text-txt-4 text-[14px] shrink-0">·</span>
              <ProjectChip projectId={projectId} project={projectQ.data} />
              <span className="text-txt-3 font-mono text-[12px] shrink-0 whitespace-nowrap">
                {rosterCount} agent{rosterCount === 1 ? "" : "s"}
                {workingCount > 0 && (
                  <> · <span className="text-status-working">{workingCount} working</span></>
                )}
              </span>
            </>
          ) : (
            <span className="text-txt-3 font-mono text-[12px] shrink-0">
              · {agents.length} agent{agents.length === 1 ? "" : "s"}
            </span>
          )}
        </div>

        <div className="ml-auto flex items-center gap-[8px]">
          {projectId && <ProjectActionsBar projectId={projectId} />}
          {canUseIso && setView && (
            <div className="inline-flex bg-bg-2 border border-line p-[3px] rounded-[8px]">
              <button
                type="button"
                className={cn("inline-flex items-center gap-[6px] px-[12px] py-[6px] rounded-[5px] text-[12.5px] transition-[background,color] duration-[120ms]", view === "iso" ? "bg-bg-3 text-txt [box-shadow:inset_0_0_0_1px_var(--line)]" : "text-txt-3")}
                onClick={() => setView("iso")}
              >
                <Icon name="map" size={12} /> Iso
              </button>
              <button
                type="button"
                className={cn("inline-flex items-center gap-[6px] px-[12px] py-[6px] rounded-[5px] text-[12.5px] transition-[background,color] duration-[120ms]", view === "cards" ? "bg-bg-3 text-txt [box-shadow:inset_0_0_0_1px_var(--line)]" : "text-txt-3")}
                onClick={() => setView("cards")}
              >
                <Icon name="grid" size={12} /> Cards
              </button>
            </div>
          )}
          <button type="button" className={`inline-flex items-center gap-[6px] ${ACCENT_BTN} font-semibold cursor-pointer px-[14px] py-[8px] rounded-[9px] text-[13px]`} onClick={() => setAddOpen(true)}>
            <Icon name="plus" size={13} /> Add agent
          </button>
        </div>
      </header>

      <div className="flex-1 min-h-0 overflow-y-auto px-[28px] py-[16px] pb-[28px]">
        {renderBody()}
      </div>

      <AddAgentModal
        open={addOpen}
        projectId={projectId}
        onClose={() => setAddOpen(false)}
        onProjectChange={(id) => setActiveId(id)}
      />
    </div>
  );
}

function CardsOfficeGhostBody() {
  return (
    <div className="flex flex-wrap gap-[14px] [&>*]:grow-0 [&>*]:shrink-0 [&>*]:min-w-0 [&>*]:basis-[calc(33.333%_-_9.34px)] max-[1024px]:[&>*]:basis-[calc(50%_-_7px)] max-[600px]:[&>*]:basis-full">
      {Array.from({ length: 6 }, (_, i) => (
        <div key={i} className="of-card bg-bg-2 border border-line flex flex-col gap-[12px] cursor-pointer relative overflow-hidden rounded-[14px] p-4 opacity-50">
          <div className="flex items-center gap-[12px]">
            <div className="bg-bg-3 w-[48px] h-[48px] rounded-[12px] shrink-0" />
            <div className="min-w-0 flex-1">
              <div className="h-[14px] w-[60%] bg-bg-3 rounded mb-[6px]" />
              <div className="h-[10px] w-[40%] bg-bg-3 rounded" />
            </div>
          </div>
          <div className="border border-line bg-bg-1 relative rounded-[10px] p-[10px_12px]">
            <div className="h-[10px] w-[30%] bg-bg-3 rounded mb-[6px]" />
            <div className="h-3 w-[80%] bg-bg-3 rounded" />
          </div>
          <div className="flex items-center gap-[10px] border-t border-line pt-[10px] mt-auto">
            <div className="h-[22px] w-[70px] bg-bg-3 rounded-md" />
            <div className="h-[22px] w-[50px] bg-bg-3 rounded-md" />
          </div>
        </div>
      ))}
    </div>
  );
}

function OfficeCard({
  agent,
  selected,
  pinned,
  onSelect,
  onPin,
}: {
  agent: OfficeAgent;
  selected: boolean;
  pinned: boolean;
  onSelect: (id: string) => void;
  onPin: (id: string) => void;
}) {
  const router = useRouter();
  const isLive = agent.status === "working" || agent.status === "thinking";
  const isError = agent.status === "error";

  const stateLabel =
    agent.taskKind === "tool" ? "doing now" :
    "status";

  const stateText = agent.task ?? "Idle - ready when you are";

  const modelColor =
    (agent.defaultModel ?? "").includes("haiku") ? "var(--done)" :
    (agent.defaultModel ?? "").includes("opus") ? "#ffcb6b" :
    "#c792ea";

  const statusText =
    agent.status === "working" ? "running" :
    agent.status === "thinking" ? "thinking" :
    agent.status === "error" ? "error" :
    "idle";

  return (
    <div
      className={cn(
        "of-card bg-bg-2 border border-line flex flex-col gap-[12px] cursor-pointer relative overflow-hidden rounded-[14px] p-4 transition-[background,border-color,transform,box-shadow] duration-[120ms] group hover:bg-bg-3 hover:border-line-2 hover:[transform:translateY(-1px)] hover:[box-shadow:var(--shadow-2)]",
        isLive && "live",
        isError && "error",
        selected && "selected",
        pinned && "border-[var(--acc-tint)] after:content-[''] after:absolute after:top-0 after:right-0 after:w-0 after:h-0 after:[border-style:solid] after:[border-width:0_20px_20px_0] after:[border-color:transparent_var(--acc)_transparent_transparent] after:[border-radius:0_14px_0_0]",
      )}
      onClick={() => onSelect(agent.id)}
      role="button"
      tabIndex={0}
      onKeyDown={e => e.key === "Enter" && onSelect(agent.id)}
    >
      <div className="flex items-center gap-[12px]">
        <div className="flex items-center justify-center relative overflow-visible w-[48px] h-[48px] shrink-0 before:content-[''] before:absolute before:inset-0 before:pointer-events-none before:[background:radial-gradient(circle_at_75%_80%,rgba(255,255,255,0.10),transparent_60%)] before:rounded-[inherit]">
          <AgentAvatar unit={agent.unitChoice} size={50} />
          <span className={cn(
            "absolute rounded-full w-[14px] h-[14px] bottom-[-2px] right-[-2px] border-2 border-bg-2",
            agent.status === "working" ? "bg-[var(--working)] [box-shadow:0_0_8px_var(--working)]" :
            agent.status === "thinking" ? "bg-[var(--thinking)]" :
            isError ? "bg-[var(--error)]" :
            "bg-txt-4",
          )} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="font-bold text-txt flex items-center gap-[6px] whitespace-nowrap overflow-hidden text-ellipsis text-[15px]">
            {pinned && <Icon name="pin" size={11} className="text-acc shrink-0" />}
            {formatAgentDisplayName(agent.name)}
          </div>
          <div className="text-txt-3 whitespace-nowrap overflow-hidden text-ellipsis font-[var(--font-mono)] text-[11px] mt-[2px]">
            {agent.id}
          </div>
        </div>
        <span className={cn(
          "inline-flex items-center gap-[6px] rounded-full bg-bg-3 border border-line text-txt-3 lowercase shrink-0 px-[9px] py-[4px] font-[var(--font-mono)] text-[10.5px] tracking-[0.04em]",
          agent.status === "working" && "status-chip live",
          agent.status === "thinking" && "bg-[color-mix(in_srgb,var(--thinking)_10%,transparent)] border-[color-mix(in_srgb,var(--thinking)_30%,transparent)] text-[var(--thinking)]",
          isError && "bg-[color-mix(in_srgb,var(--error)_10%,transparent)] border-[color-mix(in_srgb,var(--error)_30%,transparent)] text-[var(--error)]",
        )}>
          <span className={cn(
            "rounded-full w-[5px] h-[5px]",
            agent.status === "working" ? "bg-current [box-shadow:0_0_5px_currentColor]" : "bg-current",
          )} />
          {statusText}
        </span>
      </div>

      <div className={cn(
        "border border-line bg-bg-1 relative rounded-[10px] p-[10px_12px]",
        isLive && "border-[color-mix(in_srgb,var(--working)_25%,transparent)] bg-[color-mix(in_srgb,var(--working)_4%,var(--bg-1))]",
      )}>
        <div className="flex items-center gap-[6px] text-txt-3 uppercase font-[var(--font-mono)] text-[9.5px] tracking-[0.1em] mb-[4px]">
          {agent.taskKind === "tool" && <Icon name="hammer" size={10} className={isLive ? "text-[var(--working)]" : ""} />}
          {agent.taskKind === "think" && <Icon name="cpu" size={10} className={isLive ? "text-[var(--working)]" : ""} />}
          {stateLabel}
        </div>
        <div className={cn(
          "text-txt font-[var(--font-mono)] text-[12.5px] leading-[1.5]",
          !agent.task && "text-txt-2",
        )}>
          {stateText}
          {agent.status === "thinking" && (
            <span className="inline-flex gap-[2px] align-[-1px] ml-[4px]">
              <span className="rounded-[999px] w-[4px] h-[4px] bg-current animate-[of-typing_1.2s_infinite] opacity-40" />
              <span className="rounded-[999px] w-[4px] h-[4px] bg-current animate-[of-typing_1.2s_infinite] opacity-40 [animation-delay:0.15s]" />
              <span className="rounded-[999px] w-[4px] h-[4px] bg-current animate-[of-typing_1.2s_infinite] opacity-40 [animation-delay:0.3s]" />
            </span>
          )}
        </div>
      </div>

      <div className="flex items-center gap-[10px] border-t border-line pt-[10px] mt-auto">
        <span className="inline-flex items-center gap-[5px] bg-bg-3 border border-line text-txt-2 px-[6px] pr-[8px] py-[3px] rounded-[6px] font-[var(--font-mono)] text-[10.5px]">
          <span className="rounded-full w-[4px] h-[4px]" style={{ background: modelColor }} />
          {agent.defaultModel ?? "default"}
        </span>
        <span className="inline-flex items-center gap-[5px] bg-bg-3 border border-line text-txt-2 px-[6px] pr-[8px] py-[3px] rounded-[6px] font-[var(--font-mono)] text-[10.5px]">
          {agent.defaultEffort ?? "default"}
        </span>
        <span className="ml-auto font-[var(--font-mono)] text-[10.5px] text-txt-4">
          {isLive ? "now" : "idle"}
        </span>
      </div>

      <div className="of-card-actions absolute flex gap-[3px] border opacity-0 top-[12px] right-[12px] p-[3px] bg-[var(--bg-elev)] border-line-2 rounded-[8px] [box-shadow:var(--shadow-2)] [transform:translateY(-2px)] transition-[opacity,transform] duration-[140ms] z-[2] group-hover:opacity-100 group-hover:[transform:translateY(0)]">
        <button
          type="button"
          className={`${ACCENT_BTN} inline-flex items-center font-semibold px-[10px] py-0 h-[26px] gap-[4px] text-[11.5px] rounded-[5px]`}
          onClick={e => { e.stopPropagation(); onSelect(agent.id); }}
        >
          <Icon name="send" size={11} /> Chat
        </button>
        <button
          type="button"
          className={cn("flex items-center justify-center text-txt-3 w-[26px] h-[26px] rounded-[5px] hover:bg-bg-3 hover:text-txt", pinned && "text-acc bg-acc-faint")}
          title={pinned ? "Unpin" : "Pin to top"}
          onClick={e => { e.stopPropagation(); onPin(agent.id); }}
        >
          <Icon name="pin" size={12} />
        </button>
        <button
          type="button"
          className="flex items-center justify-center text-txt-3 w-[26px] h-[26px] rounded-[5px] hover:bg-bg-3 hover:text-txt"
          title="Settings"
          onClick={e => { e.stopPropagation(); router.push(PAGE_ROUTES.agentEdit(agent.id)); }}
        >
          <Icon name="edit" size={13} />
        </button>
      </div>
    </div>
  );
}
