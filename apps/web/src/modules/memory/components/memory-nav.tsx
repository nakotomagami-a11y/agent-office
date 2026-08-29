"use client";

import { useEffect, useMemo, useState } from "react";
import { match } from "ts-pattern";
import { useTranslations } from "next-intl";
import { Icon, type IconName } from "@/components/ui/icon";
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
        "flex items-center gap-[9px] w-full py-[7px] pr-[9px] rounded-[10px] text-[12.5px] border-none cursor-pointer text-left font-[inherit] select-none transition-colors duration-[130ms]",
        depth === 0 ? "pl-[9px]" : "pl-[28px]",
        selected ? "bg-acc-faint text-acc font-semibold" : "bg-transparent text-txt-2 font-medium hover:bg-card-2",
      )}
    >
      <Icon name={icon} size={13} className={cn("shrink-0", selected ? "text-acc" : "text-txt-4")} />
      <span className="overflow-hidden text-ellipsis whitespace-nowrap flex-1">{label}</span>
      {hasContent && (
        <span className={cn("shrink-0 w-[5px] h-[5px] rounded-full", selected ? "bg-acc" : "bg-txt-4")} />
      )}
    </button>
  );
}

function NavSection({ label, count }: { label: string; count?: number }) {
  return (
    <div className="flex items-center gap-[8px] mt-[6px] px-[4px] pt-[8px] pb-[6px] select-none">
      <span className="text-[9.5px] font-bold tracking-[0.09em] uppercase text-txt-4 whitespace-nowrap">{label}</span>
      <span className="flex-1 h-px bg-edge" />
      {/* `count` is derived from client-fetched query data — omit it until
          loaded so the SSR pass and the client's pre-hydration pass render
          the same (nothing), instead of a 0-vs-N hydration mismatch. */}
      {count !== undefined && <span className="font-[var(--font-mono)] text-[10px] text-txt-4">{count}</span>}
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
  const [filter, setFilter] = useState("");

  // The section counts render from react-query cache state, which can already
  // be warm on mount (another component fetched the same data first) even
  // though the server-rendered pass always starts cold — a `mounted` gate
  // guarantees the client's first paint matches the server's regardless of
  // cache timing, instead of chasing `isLoading` (which isn't reliably in
  // sync between the SSR pass and hydration).
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

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

  const needle = filter.trim().toLowerCase();
  const projects = useMemo(
    () => (needle ? (projectsQ.data ?? []).filter((p) => p.name.toLowerCase().includes(needle)) : projectsQ.data ?? []),
    [projectsQ.data, needle],
  );
  const agents = useMemo(
    () => (needle ? (agentsQ.data ?? []).filter((a) => a.name.toLowerCase().includes(needle)) : agentsQ.data ?? []),
    [agentsQ.data, needle],
  );

  return (
    <nav
      aria-label="Memory scopes"
      className="w-[268px] shrink-0 rounded-[22px] surface-sheen shadow-[var(--lift)] overflow-hidden flex flex-col min-h-0"
    >
      <div className="shrink-0 p-[12px]">
        <button
          type="button"
          onClick={() => onSelect({ kind: "global" })}
          className={cn(
            "flex items-center gap-[10px] w-full py-[11px] px-[13px] rounded-[15px] text-[13px] font-bold border-none cursor-pointer text-left transition-[transform,box-shadow] duration-150",
            isSel({ kind: "global" })
              ? "bg-[linear-gradient(120deg,var(--acc-cta),var(--acc-2))] text-white shadow-[0_12px_24px_-14px_rgba(139,123,255,0.9)]"
              : "bg-card-2 border border-edge text-txt-2 hover:text-txt",
          )}
        >
          <Icon name="memory" size={15} className="shrink-0" />
          <span className="flex-1">{t("global_label")}</span>
          {(contentMap.get("global") ?? false) && <span className="w-[6px] h-[6px] rounded-full bg-current shrink-0" />}
        </button>

        <div className="flex items-center gap-[9px] mt-[10px] py-[9px] px-[12px] rounded-[13px] bg-card-2 border border-edge shadow-[var(--inset-hi)]">
          <Icon name="search" size={14} className="shrink-0 text-txt-4" />
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder={t("filter_placeholder")}
            className="flex-1 min-w-0 bg-transparent border-none outline-none text-[12px] text-txt placeholder:text-txt-4"
          />
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-[12px] pb-[12px] flex flex-col gap-[1px]">
        <NavSection label={t("projects_heading")} count={mounted ? projects.length : undefined} />
        {!mounted || projectsQ.isLoading ? null : !projects.length ? (
          <div className="px-[9px] py-[6px] text-[11px] text-txt-4 font-[var(--font-mono)]">{t("no_projects")}</div>
        ) : (
          projects.map((p) => {
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
              />
            );
          })
        )}

        <NavSection label={t("agents_heading")} count={mounted ? agents.length : undefined} />
        {!mounted || agentsQ.isLoading ? null : !agents.length ? (
          <div className="px-[9px] py-[6px] text-[11px] text-txt-4 font-[var(--font-mono)]">{t("no_agents")}</div>
        ) : (
          agents.map((a) => {
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
                />
                {isExpanded ? skills.map((slug) => {
                  const sk: MemoryScope = { kind: "agent-skill", agentId: a.name, skillSlug: slug };
                  return (
                    <button
                      key={slug}
                      type="button"
                      onClick={() => onSelect(sk)}
                      className={cn(
                        "flex items-center gap-[9px] w-full py-[6px] pr-[9px] pl-[28px] rounded-[10px] text-[11.5px] border-none cursor-pointer text-left font-[inherit] select-none transition-colors duration-[130ms]",
                        isSel(sk) ? "bg-acc-faint text-acc font-semibold" : "bg-transparent text-txt-3 font-medium hover:bg-card-2",
                      )}
                      title={`Skill: ${slug}`}
                    >
                      <Icon name="sparkle" size={11} className={cn("shrink-0", isSel(sk) ? "text-acc" : "text-txt-4")} />
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
      <div className="px-[16px] py-[10px] border-t border-edge shrink-0">
        <span className="font-[var(--font-mono)] text-[10px] text-txt-4">⌘S to save</span>
      </div>
    </nav>
  );
}
