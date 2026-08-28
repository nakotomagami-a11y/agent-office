"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { EmptyState } from "@/components/ui/empty-state";
import { AgentListGhost } from "./agent-list-ghost";
import { Icon } from "@/components/ui/icon";
import { UnitSprite } from "@/components/ui/unit-sprite";
import { unitForAgent } from "@/components/ui/unit-sprite-registry";
import { cn } from "@/lib/cn";
import { agentDisplayName } from "@/lib/agent-display-name";
import { useOfficeStore } from "@/modules/office/hooks/use-office-store";
import { useRuns } from "@/modules/runs/hooks/use-runs";
import type { ApiAgent } from "@agent-office/domain/types";
import { useAgents } from "../hooks/use-agents";
import { categorize, categoryColor, tallyCategories } from "../form/categorize";
import { useActiveProjectStore } from "@/lib/active-project-store";
import { useSpawnInstance } from "@/modules/office/hooks/use-spawn-instance";

/**
 * Agent gallery. Cards show the standing unit sprite, name/slug, category
 * tag, and model/effort badges — no description or persistent buttons, both
 * only surface on hover. Search box and category chips derive from `room`
 * or a name-prefix heuristic in `categorize.ts`. Clicking a card spawns a
 * fresh roster instance and opens it; the small Edit button opens the
 * global agent details modal's settings tab directly.
 */
export function AgentList() {
  const t = useTranslations();
  const { data, isLoading } = useAgents();
  const runsQ = useRuns({ limit: 500 });
  const select = useOfficeStore((s) => s.select);
  const activeProjectId = useActiveProjectStore((s) => s.id);
  const { spawnInstance } = useSpawnInstance({ activeProjectId });

  /**
   * Clicking an agent card from the Agents gallery ALWAYS creates a fresh
   * roster instance in the active project, then opens the details modal
   * on the new instance's conversation tab. If there is no active project,
   * fall back to plain select() so the details modal still opens for
   * browsing (previous behaviour).
   */
  const openAgentAsNewInstance = async (agentId: string) => {
    if (!activeProjectId) {
      select(agentId);
      return;
    }
    // spawnInstance takes care of the roster mutation + cap-check flow;
    // it uses useAddInstance under the hood which invalidates the project
    // query, so the details modal picks up the new instance immediately.
    await spawnInstance(agentId);
    select(agentId, { tab: "conversation" });
  };

  const [search, setSearch] = useState("");
  const [activeCats, setActiveCats] = useState<Set<string>>(() => new Set());

  const agents = useMemo(() => data ?? [], [data]);
  const categories = useMemo(() => {
    const tally = tallyCategories(agents);
    return Object.entries(tally).sort((a, b) => b[1] - a[1]);
  }, [agents]);

  const usesByAgent = useMemo(() => {
    const m: Record<string, number> = {};
    for (const r of runsQ.data ?? []) {
      m[r.agentId] = (m[r.agentId] ?? 0) + 1;
    }
    return m;
  }, [runsQ.data]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return agents.filter((a) => {
      if (activeCats.size > 0 && !activeCats.has(categorize(a))) return false;
      if (!q) return true;
      if (a.name.toLowerCase().includes(q)) return true;
      // Also match against the human-readable form so "CEO" finds "cs-ceo",
      // "backend" finds "backend-builder", etc.
      if (agentDisplayName(a).toLowerCase().includes(q)) return true;
      if (a.description?.toLowerCase().includes(q)) return true;
      if (a.skills?.some((s) => s.toLowerCase().includes(q))) return true;
      if (a.tools?.some((tl) => tl.toLowerCase().includes(q))) return true;
      return false;
    });
  }, [agents, search, activeCats]);

  const toggleCat = (cat: string) => {
    setActiveCats((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  };

  if (isLoading) {
    return <AgentListGhost />;
  }

  if (agents.length === 0) {
    return (
      <EmptyState
        icon="users"
        title={t("common.empty")}
        description={t("agent_list.empty_hint")}
      />
    );
  }

  return (
    <div className="p-[18px] overflow-auto flex flex-col gap-[14px]">
      <FilterBar
        search={search}
        onSearchChange={setSearch}
        categories={categories}
        active={activeCats}
        onToggle={toggleCat}
        onClear={() => setActiveCats(new Set())}
        total={agents.length}
        visible={visible.length}
      />

      {visible.length === 0 ? (
        <div className="p-8 text-center text-txt-3 text-[13px]">
          {t("agent_list.no_matches")}
        </div>
      ) : (
        <div className="flex flex-wrap gap-[12px] [&>*]:[flex:1_1_150px] [&>*]:max-w-[220px] max-[900px]:[&>*]:[flex:1_1_calc(33%-8px)] max-[600px]:[&>*]:[flex:1_1_calc(50%-6px)]">
          {visible.map((a) => (
            <AgentCard
              key={a.name}
              agent={a}
              uses={usesByAgent[a.name] ?? 0}
              onOpen={() => { void openAgentAsNewInstance(a.name); }}
              onEdit={() => select(a.name, { tab: "customization" })}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function FilterBar({
  search,
  onSearchChange,
  categories,
  active,
  onToggle,
  onClear,
  total,
  visible,
}: {
  search: string;
  onSearchChange: (next: string) => void;
  categories: Array<[string, number]>;
  active: Set<string>;
  onToggle: (cat: string) => void;
  onClear: () => void;
  total: number;
  visible: number;
}) {
  const t = useTranslations();
  return (
    <div className="flex items-center gap-[10px]">
      <SearchInput value={search} onChange={onSearchChange} />
      <span className="font-mono text-[11px] text-txt-3 shrink-0">
        {t("agent_list.shown_count", { visible, total })}
      </span>
      {categories.length > 0 ? (
        <div className="surface-sheen flex items-center gap-[2px] p-[5px] rounded-2xl shadow-[var(--lift)] shrink-0 overflow-x-auto max-w-full">
          <FilterChip
            label={t("agent_list.filter_all")}
            count={total}
            on={active.size === 0}
            onClick={onClear}
          />
          {categories.map(([cat, count]) => (
            <FilterChip
              key={cat}
              label={cat}
              count={count}
              on={active.has(cat)}
              onClick={() => onToggle(cat)}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function SearchInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (next: string) => void;
}) {
  const t = useTranslations();
  return (
    <label className="surface-sheen relative flex-1 min-w-[220px] flex items-center h-[42px] rounded-2xl shadow-[var(--lift)] px-[14px] pl-[38px] transition-colors duration-[120ms]">
      <Icon
        name="search"
        size={15}
        className="absolute left-[14px] top-1/2 -translate-y-1/2 text-txt-4 pointer-events-none"
      />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={t("agent_list.search_placeholder")}
        aria-label={t("agent_list.search_aria")}
        className="w-full bg-transparent border-none outline-none font-[inherit] text-[13px] text-txt placeholder:text-txt-4"
      />
      {value ? (
        <button
          type="button"
          onClick={() => onChange("")}
          aria-label={t("agent_list.clear_search_aria")}
          className="bg-transparent border-none cursor-pointer text-txt-3 p-1 -mr-1 inline-flex rounded-full"
        >
          <Icon name="x" size={12} />
        </button>
      ) : null}
    </label>
  );
}

function FilterChip({
  label,
  count,
  on,
  onClick,
}: {
  label: string;
  count: number;
  on: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={cn(
        "inline-flex items-center gap-[7px] py-[7px] px-[13px] rounded-xl text-[12.5px] font-semibold cursor-pointer font-[inherit] whitespace-nowrap transition-[filter] duration-150",
        on
          ? "bg-[linear-gradient(120deg,var(--acc-cta),var(--acc-2))] text-white shadow-[0_8px_18px_-10px_color-mix(in_srgb,var(--acc)_80%,transparent)]"
          : "bg-transparent text-txt-3 hover:brightness-110",
      )}
    >
      {label}
      <span className={cn("font-mono text-[10px]", on ? "opacity-65" : "text-txt-4")}>{count}</span>
    </button>
  );
}

function AgentCard({
  agent,
  uses,
  onOpen,
  onEdit,
}: {
  agent: ApiAgent;
  uses: number;
  onOpen: () => void;
  onEdit: () => void;
}) {
  const t = useTranslations();
  const unit = unitForAgent(agent.name, agent.unit);
  const category = categorize(agent);
  const catColor = categoryColor(category);
  const stateDot = uses > 0 ? "var(--green)" : "var(--txt-4)";

  return (
    <div
      className="group relative flex flex-col items-center gap-[10px] cursor-pointer surface-sheen rounded-[20px] shadow-[var(--lift)] pt-4 pb-[14px] px-3 transition-transform duration-200 hover:-translate-y-1"
      onClick={onOpen}
      role="button"
      tabIndex={0}
      onKeyDown={e => e.key === "Enter" && onOpen()}
    >
      <span className="absolute top-[10px] left-[10px] inline-flex items-center gap-[5px] font-[var(--font-mono)] text-[9.5px] text-txt-4 whitespace-nowrap">
        <span className="w-[5px] h-[5px] rounded-full shrink-0" style={{ background: stateDot }} />
        {t("agent_list.uses_count", { count: uses })}
      </span>
      <span
        className="cat-tag absolute top-[9px] right-[10px] text-[9px] font-bold uppercase tracking-[0.05em] px-[7px] py-[2px] rounded-full whitespace-nowrap transition-opacity duration-150 group-hover:opacity-0"
        style={{
          "--cat-color": catColor,
          background: `color-mix(in srgb, ${catColor} 16%, transparent)`,
          color: catColor,
        } as React.CSSProperties}
      >
        {category}
      </span>

      <button
        type="button"
        title={t("agent_list.edit_title")}
        aria-label={t("agent_list.edit_aria", { name: agent.name })}
        onClick={e => { e.stopPropagation(); onEdit(); }}
        className="absolute top-[9px] right-[10px] w-[22px] h-[22px] flex items-center justify-center rounded-[7px] bg-bg-elev text-txt-2 opacity-0 group-hover:opacity-100 hover:text-txt hover:bg-bg-3 transition-opacity duration-150 z-[1]"
      >
        <Icon name="edit" size={11} />
      </button>

      <div className="relative w-[76px] h-[80px] mt-[14px] flex items-end justify-center">
        <span
          aria-hidden
          className="absolute bottom-[6px] w-[70px] h-[12px] rounded-full"
          style={{ background: `radial-gradient(ellipse at 50% 50%, color-mix(in srgb, ${catColor} 35%, transparent), transparent 70%)` }}
        />
        <UnitSprite unit={unit} size={72} className="relative" />
      </div>

      <div className="text-center leading-[1.3] w-full min-w-0">
        <div className="text-[13px] font-bold whitespace-nowrap overflow-hidden text-ellipsis">{agentDisplayName(agent)}</div>
        <div className="font-[var(--font-mono)] text-[9.5px] text-txt-4 mt-[3px] whitespace-nowrap overflow-hidden text-ellipsis">{agent.name}</div>
      </div>

      <div className="flex items-center gap-[5px]">
        <span className="font-[var(--font-mono)] text-[9.5px] px-[7px] py-[2px] rounded-[6px] bg-card-2 border border-edge text-txt-3 whitespace-nowrap">
          {agent.defaultModel ?? t("agent_list.model_default")}
        </span>
        {agent.defaultEffort ? (
          <span className="font-[var(--font-mono)] text-[9.5px] px-[7px] py-[2px] rounded-[6px] bg-card-2 border border-edge text-txt-4 whitespace-nowrap">
            {agent.defaultEffort}
          </span>
        ) : null}
      </div>
    </div>
  );
}
