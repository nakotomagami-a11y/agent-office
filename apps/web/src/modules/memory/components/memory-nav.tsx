"use client";

import { match } from "ts-pattern";
import { useTranslations } from "next-intl";
import { Icon, type IconName } from "@/components/ui/icon";
import { Skeleton } from "@/components/ui/skeleton";
import { useAgents } from "@/modules/agents/hooks/use-agents";
import { useProjects } from "@/modules/projects/hooks/use-projects";
import { cn } from "@/lib/cn";
import { type MemoryScope } from "../hooks/use-memory";
import { scopeKey } from "../scope/scope";

type NavItemProps = {
  scope: MemoryScope;
  label: string;
  icon: IconName;
  selected: boolean;
  hasContent: boolean;
  onSelect: (s: MemoryScope) => void;
  depth?: number;
};

function NavItem({ scope, label, icon, selected, hasContent, onSelect, depth = 0 }: NavItemProps) {
  return (
    <button
      type="button"
      onClick={() => onSelect(scope)}
      className={cn(
        "flex items-center gap-[6px] w-full h-[22px] pr-2 text-[12px] border-none cursor-pointer text-left font-[inherit] select-none transition-colors duration-[80ms]",
        depth === 0 ? "pl-2" : "pl-5",
        selected
          ? "text-acc font-medium bg-acc-faint [box-shadow:inset_2px_0_0_var(--acc)]"
          : "bg-transparent text-txt-2 hover:bg-bg-3 hover:text-txt [box-shadow:inset_2px_0_0_transparent]",
      )}
    >
      <Icon name={icon} size={12} className={cn("shrink-0", selected ? "opacity-100" : "opacity-[0.55]")} />
      <span className="overflow-hidden text-ellipsis whitespace-nowrap flex-1">{label}</span>
      {hasContent && (
        <span className={cn("shrink-0 w-[5px] h-[5px] rounded-full", selected ? "bg-acc" : "bg-txt-4")} />
      )}
    </button>
  );
}

function NavSection({ label }: { label: string }) {
  return (
    <div className="flex items-center h-[20px] mt-[10px] mb-[1px] px-[8px] text-[9.5px] font-semibold tracking-[0.1em] uppercase text-txt-4 select-none">
      {label}
    </div>
  );
}

type MemoryNavProps = {
  selected: MemoryScope;
  onSelect: (s: MemoryScope) => void;
  contentMap: Map<string, boolean>;
};

export function MemoryNav({ selected, onSelect, contentMap }: MemoryNavProps) {
  const t = useTranslations("memory_page");
  const agentsQ = useAgents();
  const projectsQ = useProjects();

  function isSel(scope: MemoryScope): boolean {
    return match(scope)
      .with({ kind: "global" }, () => selected.kind === "global")
      .with({ kind: "project" }, (s) => selected.kind === "project" && selected.id === s.id)
      .with({ kind: "agent" }, (s) => selected.kind === "agent" && selected.id === s.id)
      .with({ kind: "agent-skill" }, (s) => selected.kind === "agent-skill" && selected.agentId === s.agentId && selected.skillSlug === s.skillSlug)
      .exhaustive();
  }

  // When any child of an agent is selected (agent scope or one of its
  // skills), that agent row is considered "expanded" and its skills are
  // rendered as nested items.
  const expandedAgentId = selected.kind === "agent"
    ? selected.id
    : selected.kind === "agent-skill"
      ? selected.agentId
      : null;

  return (
    <nav
      aria-label="Memory scopes"
      className="w-[204px] shrink-0 border-r border-line overflow-y-auto flex flex-col"
    >
      <div className="flex-1 py-[6px] px-[4px] flex flex-col gap-[1px]">
        <NavItem
          scope={{ kind: "global" }}
          label={t("global_label")}
          icon="memory"
          selected={isSel({ kind: "global" })}
          hasContent={contentMap.get("global") ?? false}
          onSelect={onSelect}
        />

        <NavSection label={t("projects_heading")} />
        {projectsQ.isLoading ? (
          <div className="px-[8px] py-[3px]"><Skeleton width="70%" height={12} /></div>
        ) : !projectsQ.data?.length ? (
          <div className="px-[20px] py-[2px] text-[11px] text-txt-4 font-[var(--font-mono)]">{t("no_projects")}</div>
        ) : (
          projectsQ.data.map((p) => {
            const scope: MemoryScope = { kind: "project", id: p.id, name: p.name };
            return (
              <NavItem
                key={p.id}
                scope={scope}
                label={p.name}
                icon="folder"
                selected={isSel(scope)}
                hasContent={contentMap.get(scopeKey(scope)) ?? false}
                onSelect={onSelect}
                depth={1}
              />
            );
          })
        )}

        <NavSection label={t("agents_heading")} />
        {agentsQ.isLoading ? (
          <div className="px-[8px] py-[3px]"><Skeleton width="70%" height={12} /></div>
        ) : !agentsQ.data?.length ? (
          <div className="px-[20px] py-[2px] text-[11px] text-txt-4 font-[var(--font-mono)]">{t("no_agents")}</div>
        ) : (
          agentsQ.data.map((a) => {
            const scope: MemoryScope = { kind: "agent", id: a.name, name: a.name };
            const skills = a.skills ?? [];
            const isExpanded = expandedAgentId === a.name && skills.length > 0;
            return (
              <div key={a.name} className="flex flex-col gap-[1px]">
                <NavItem
                  scope={scope}
                  label={a.name}
                  icon="cpu"
                  selected={isSel(scope)}
                  hasContent={contentMap.get(scopeKey(scope)) ?? false}
                  onSelect={onSelect}
                  depth={1}
                />
                {isExpanded ? skills.map((slug) => {
                  const sk: MemoryScope = { kind: "agent-skill", agentId: a.name, skillSlug: slug };
                  return (
                    <button
                      key={slug}
                      type="button"
                      onClick={() => onSelect(sk)}
                      className={cn(
                        "flex items-center gap-[6px] w-full h-[20px] pl-10 pr-2 text-[11.5px] border-none cursor-pointer text-left font-[inherit] select-none transition-colors duration-[80ms]",
                        isSel(sk)
                          ? "text-acc bg-acc-faint [box-shadow:inset_2px_0_0_var(--acc)]"
                          : "bg-transparent text-txt-3 hover:bg-bg-3 hover:text-txt-2 [box-shadow:inset_2px_0_0_transparent]",
                      )}
                      title={`Skill: ${slug}`}
                    >
                      <Icon name="sparkle" size={10} className={cn("shrink-0", isSel(sk) ? "opacity-100" : "opacity-[0.5]")} />
                      <span className="overflow-hidden text-ellipsis whitespace-nowrap flex-1 font-[var(--font-mono)]">{slug}</span>
                    </button>
                  );
                }) : null}
              </div>
            );
          })
        )}
      </div>

      {/* Keyboard hint */}
      <div className="px-[10px] py-[8px] border-t border-line shrink-0">
        <span className="font-[var(--font-mono)] text-[10px] text-txt-4">⌘S to save</span>
      </div>
    </nav>
  );
}
