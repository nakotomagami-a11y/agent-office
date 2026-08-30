"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Icon, type IconName } from "@/components/ui/icon";
import { useAgents } from "@/modules/agents/hooks/use-agents";
import { useProjects } from "@/modules/projects/hooks/use-projects";
import { cn } from "@/lib/cn";
import { type MemoryScope } from "../hooks/use-memory";
import { scopeKey } from "../scope/scope";

type MemoryNavProps = {
  selected: MemoryScope;
  onSelect: (s: MemoryScope) => void;
  contentMap: Map<string, boolean>;
};

export function MemoryNav({ selected, onSelect, contentMap }: MemoryNavProps) {
  const t = useTranslations("memory_page");
  const agentsQ = useAgents();
  const projectsQ = useProjects();
  const [filter, setFilter] = useState("");
  const [expandedAgent, setExpandedAgent] = useState<string | null>(null);

  // Two scopes are "the same" iff their canonical keys match — same
  // equivalence `scopeKey` already encodes (kind + id/slug), so reuse it
  // instead of re-deriving the per-kind comparison here.
  function isSel(scope: MemoryScope): boolean {
    return scopeKey(scope) === scopeKey(selected);
  }

  const q = filter.trim().toLowerCase();
  const projects = useMemo(
    () => (projectsQ.data ?? []).filter((p) => !q || p.name.toLowerCase().includes(q)),
    [projectsQ.data, q],
  );
  const agents = useMemo(
    () => (agentsQ.data ?? []).filter((a) => !q || a.name.toLowerCase().includes(q)),
    [agentsQ.data, q],
  );

  // Auto-expand whichever agent owns the current selection.
  const activeAgentId = selected.kind === "agent" ? selected.id : selected.kind === "agent-skill" ? selected.agentId : null;
  const openAgentId = expandedAgent ?? activeAgentId;

  return (
    <nav
      aria-label="Memory scopes"
      className="w-[268px] shrink-0 flex flex-col min-h-0 rounded-[22px] surface-sheen shadow-[var(--lift)] overflow-hidden"
    >
      <div className="shrink-0 p-[12px]">
        <button
          type="button"
          onClick={() => onSelect({ kind: "global" })}
          className={cn(
            "w-full flex items-center gap-[10px] py-[11px] px-[13px] rounded-[15px] text-[13px] font-bold whitespace-nowrap cursor-pointer transition-all duration-150",
            selected.kind === "global"
              ? "bg-[linear-gradient(120deg,var(--acc-cta),var(--acc-2))] text-white"
              : "bg-card-2 text-txt-2 hover:text-txt",
          )}
        >
          <Icon name="memory" size={15} className="shrink-0" />
          <span className="flex-1 text-left">{t("global_label")}</span>
          {contentMap.get("global") ? <span className="w-[6px] h-[6px] rounded-full bg-current shrink-0" /> : null}
        </button>
        <div className="flex items-center gap-[9px] mt-[10px] py-[9px] px-[12px] rounded-[13px] bg-card-2 border border-edge shadow-[var(--inset-hi)] cursor-text">
          <Icon name="search" size={14} className="text-txt-4 shrink-0" />
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter…"
            className="flex-1 min-w-0 border-none bg-transparent outline-none text-[12px] text-txt placeholder:text-txt-4"
          />
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-[12px] pb-[12px]">
        <NavGroup label={t("projects_heading")} count={projects.length}>
          {projectsQ.isLoading ? null : projects.length === 0 ? (
            <div className="px-[9px] py-[6px] font-mono text-[11px] text-txt-4">{t("no_projects")}</div>
          ) : (
            projects.map((p) => {
              const scope: MemoryScope = { kind: "project", id: p.id, name: p.name };
              return (
                <NavRow
                  key={p.id}
                  icon="folder"
                  name={p.name}
                  selected={isSel(scope)}
                  hasNote={contentMap.get(scopeKey(scope)) ?? false}
                  onClick={() => onSelect(scope)}
                />
              );
            })
          )}
        </NavGroup>

        <NavGroup label={t("agents_heading")} count={agents.length}>
          {agentsQ.isLoading ? null : agents.length === 0 ? (
            <div className="px-[9px] py-[6px] font-mono text-[11px] text-txt-4">{t("no_agents")}</div>
          ) : (
            agents.map((a) => {
              const scope: MemoryScope = { kind: "agent", id: a.name, name: a.name };
              const skills = a.skills ?? [];
              const isOpen = openAgentId === a.name && skills.length > 0;
              return (
                <div key={a.name}>
                  <NavRow
                    icon="cpu"
                    name={a.name}
                    selected={isSel(scope)}
                    hasNote={contentMap.get(scopeKey(scope)) ?? false}
                    onClick={() => onSelect(scope)}
                    hasChildren={skills.length > 0}
                    expanded={isOpen}
                    onToggle={() => setExpandedAgent((cur) => (cur === a.name ? null : a.name))}
                  />
                  {isOpen ? (
                    <div className="mt-[2px] mb-[4px] ml-[20px] pl-[11px] border-l border-edge flex flex-col gap-[1px]">
                      {skills.map((slug) => {
                        const sk: MemoryScope = { kind: "agent-skill", agentId: a.name, skillSlug: slug };
                        const active = isSel(sk);
                        return (
                          <button
                            key={slug}
                            type="button"
                            onClick={() => onSelect(sk)}
                            title={`Skill: ${slug}`}
                            className={cn(
                              "flex items-center gap-[8px] py-[6px] px-[9px] rounded-[9px] font-mono text-[11px] whitespace-nowrap overflow-hidden text-ellipsis cursor-pointer transition-colors duration-150",
                              active ? "bg-acc-soft text-acc" : "text-txt-3 hover:bg-card-2",
                            )}
                          >
                            <Icon name="sparkle" size={11} className={cn("shrink-0", active ? "text-acc" : "text-txt-4")} />
                            <span className="truncate">{slug}</span>
                          </button>
                        );
                      })}
                    </div>
                  ) : null}
                </div>
              );
            })
          )}
        </NavGroup>
      </div>
    </nav>
  );
}

function NavGroup({ label, count, children }: { label: string; count: number; children: React.ReactNode }) {
  return (
    <div className="mt-[6px]">
      <div className="flex items-center gap-[8px] py-[6px] px-[4px]">
        <span className="text-[9.5px] font-bold tracking-[0.09em] uppercase text-txt-4 whitespace-nowrap">{label}</span>
        <span className="flex-1 h-px bg-edge" aria-hidden />
        <span className="font-mono text-[10px] text-txt-4">{count}</span>
      </div>
      <div className="flex flex-col gap-[1px]">{children}</div>
    </div>
  );
}

function NavRow({
  icon,
  name,
  selected,
  hasNote,
  onClick,
  hasChildren,
  expanded,
  onToggle,
}: {
  icon: IconName;
  name: string;
  selected: boolean;
  hasNote: boolean;
  onClick: () => void;
  hasChildren?: boolean;
  expanded?: boolean;
  onToggle?: () => void;
}) {
  return (
    <div
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === "Enter" && onClick()}
      className={cn(
        "flex items-center gap-[9px] py-[7px] px-[9px] rounded-[10px] cursor-pointer transition-colors duration-150",
        selected ? "bg-acc-soft" : "hover:bg-card-2",
      )}
    >
      <span
        onClick={(e) => { e.stopPropagation(); onToggle?.(); }}
        className="w-[12px] shrink-0 flex items-center justify-center text-txt-4"
      >
        {hasChildren ? (
          <Icon
            name="chevron"
            size={10}
            className={cn("transition-transform duration-150", expanded ? "rotate-90" : "")}
          />
        ) : null}
      </span>
      <Icon name={icon} size={13} className={cn("shrink-0", selected || hasChildren ? "text-acc" : "text-txt-4")} />
      <span
        className={cn(
          "flex-1 min-w-0 text-[12.5px] whitespace-nowrap overflow-hidden text-ellipsis",
          selected ? "text-acc font-semibold" : hasChildren ? "text-txt font-semibold" : "text-txt-2 font-medium",
        )}
      >
        {name}
      </span>
      {hasNote ? <span className="w-[5px] h-[5px] rounded-full bg-acc shrink-0" /> : null}
    </div>
  );
}
