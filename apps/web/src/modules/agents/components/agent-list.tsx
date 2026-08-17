"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { EmptyState } from "@/components/ui/empty-state";
import { AgentListGhost } from "./agent-list-ghost";
import { Icon } from "@/components/ui/icon";
import { AgentAvatar } from "@/components/ui/agent-avatar";
import { unitForAgent } from "@/components/ui/unit-sprite-registry";
import { cn } from "@/lib/cn";
import { ACCENT_BTN } from "@/lib/button-styles";
import { formatAgentDisplayName } from "@/lib/agent-display-name";
import { useOfficeStore } from "@/modules/office/hooks/use-office-store";
import { useRuns } from "@/modules/runs/hooks/use-runs";
import type { ApiAgent } from "@agent-office/domain/types";
import { useAgents } from "../hooks/use-agents";
import { categorize, categoryColor, tallyCategories } from "../form/categorize";
import { useActiveProjectStore } from "@/lib/active-project-store";
import { useSpawnInstance } from "@/modules/office/hooks/use-spawn-instance";

/**
 * Agent gallery. Card grid styled after the v3 `TemplatesView`, with a
 * search box and category chips (derived from `room` or a name-prefix
 * heuristic in `categorize.ts`). Clicking a card opens the global agent
 * details modal so chat and settings stay inline.
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
      if (formatAgentDisplayName(a.name).toLowerCase().includes(q)) return true;
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
        <div className="flex flex-wrap gap-[14px] [&>*]:[flex:1_1_300px] max-[1024px]:[&>*]:[flex:1_1_calc(50%-7px)] max-[600px]:[&>*]:[flex:1_1_100%]">
          {visible.map((a) => (
            <AgentCard
              key={a.name}
              agent={a}
              uses={usesByAgent[a.name] ?? 0}
              onOpen={() => { void openAgentAsNewInstance(a.name); }}
              onEdit={() => select(a.name, { tab: "settings" })}
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
    <div className="flex flex-col gap-[10px]">
      <div className="flex items-center gap-[10px] flex-wrap">
        <SearchInput value={search} onChange={onSearchChange} />
        <span className="font-mono text-[11px] text-txt-3">
          {t("agent_list.shown_count", { visible, total })}
        </span>
      </div>

      {categories.length > 0 ? (
        <div className="flex flex-wrap gap-[6px] items-center">
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
    <label className="relative [flex:1_1_320px] max-w-[480px] flex items-center h-8 bg-bg-1 border border-line-2 rounded-md shadow-1 px-3 pl-8 transition-colors duration-[120ms]">
      <Icon
        name="search"
        size={14}
        className="absolute left-[10px] top-1/2 -translate-y-1/2 text-txt-3 pointer-events-none"
      />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={t("agent_list.search_placeholder")}
        aria-label={t("agent_list.search_aria")}
        className="w-full bg-transparent border-none outline-none font-[inherit] text-[13px] text-txt"
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
        "inline-flex items-center gap-[6px] py-[5px] px-[10px] rounded-full text-xs font-medium cursor-pointer font-[inherit]",
        on
          ? "border border-acc bg-acc-faint text-acc"
          : "border border-line bg-bg-1 text-txt-2",
      )}
    >
      {label}
      <span
        className={cn(
          "font-mono text-[10.5px] px-[6px] py-[1px] rounded-full",
          on ? "text-acc" : "bg-bg-2 text-txt-3",
        )}
        style={on ? { background: "rgba(233,84,32,0.18)" } : undefined}
      >
        {count}
      </span>
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

  // Clamp long ABOUT text to 3 lines with a Read more/less toggle. `overflowing`
  // is measured (scrollHeight vs the clamped clientHeight) so the button only
  // appears when the text is actually truncated, and re-measured on resize.
  const [expanded, setExpanded] = useState(false);
  const [overflowing, setOverflowing] = useState(false);
  const descRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = descRef.current;
    if (!el) return;
    const measure = () => {
      if (expanded) return;
      setOverflowing(el.scrollHeight > el.clientHeight + 1);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [agent.description, expanded]);
  const modelColor =
    (agent.defaultModel ?? "").includes("haiku") ? "var(--done)" :
    (agent.defaultModel ?? "").includes("opus") ? "#ffcb6b" :
    "#c792ea";

  return (
    <div
      className="of-card bg-bg-2 border border-line flex flex-col gap-[12px] cursor-pointer relative overflow-hidden rounded-[14px] p-4 transition-[background,border-color,transform,box-shadow] duration-[120ms] group hover:bg-bg-3 hover:border-line-2 hover:[transform:translateY(-1px)] hover:[box-shadow:var(--shadow-2)]"
      onClick={onOpen}
      role="button"
      tabIndex={0}
      onKeyDown={e => e.key === "Enter" && onOpen()}
    >
      <div className="flex items-center gap-[12px]">
        <div className="bg-bg-3 border border-line flex items-center justify-center relative overflow-visible w-[48px] h-[48px] rounded-[12px] shrink-0">
          <AgentAvatar unit={unit} size={42} />
        </div>
        <div className="min-w-0 flex-1">
          {/* Big line: human-readable display name derived from the slug.
              Small line: raw slug (kebab-case) so power users still see the
              ID they'd type in the CLI or reference in configs. */}
          <div className="font-bold text-txt flex items-center gap-[6px] whitespace-nowrap overflow-hidden text-ellipsis text-[15px]">{formatAgentDisplayName(agent.name)}</div>
          <div className="text-txt-3 whitespace-nowrap overflow-hidden text-ellipsis font-[var(--font-mono)] text-[11px] mt-[2px]">{agent.name}</div>
        </div>
        {/* `color` is resolved by the .cat-tag rule in globals.css, not here:
            these palette entries are mid-tone saturated hues picked for a dark
            card, and as text on the light theme's 12% wash they land at
            2.2-3.5:1. The rule darkens them for light mode only, so an inline
            colour would defeat it. */}
        <span
          className="cat-tag inline-flex items-center gap-[6px] rounded-full bg-bg-3 border border-line lowercase shrink-0 px-[9px] py-[4px] font-[var(--font-mono)] text-[10.5px] tracking-[0.04em]"
          style={{
            "--cat-color": catColor,
            background: `color-mix(in srgb, ${catColor} 12%, var(--bg-2))`,
            border: `1px solid color-mix(in srgb, ${catColor} 30%, transparent)`,
          } as React.CSSProperties}
        >
          {category}
        </span>
      </div>

      <div className="border border-line bg-bg-1 relative rounded-[10px] p-[10px_12px]">
        <div className="flex items-center gap-[6px] text-txt-3 uppercase font-[var(--font-mono)] text-[9.5px] tracking-[0.1em] mb-[4px]">about</div>
        <div
          ref={descRef}
          className={cn(
            "text-txt font-[var(--font-mono)] text-[12.5px] leading-[1.5]",
            !expanded && "line-clamp-3",
            !agent.description && "text-txt-3",
          )}
        >
          {agent.description || t("agent_list.description_empty")}
        </div>
        {overflowing && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setExpanded((v) => !v); }}
            className="mt-[5px] font-[var(--font-mono)] text-[10.5px] text-acc hover:underline cursor-pointer"
          >
            {expanded ? "Read less" : "Read more"}
          </button>
        )}
      </div>

      <div className="flex items-center gap-[10px] border-t border-line pt-[10px] mt-auto">
        <span className="inline-flex items-center gap-[5px] bg-bg-3 border border-line text-txt-2 px-[6px] pr-[8px] py-[3px] rounded-[6px] font-[var(--font-mono)] text-[10.5px]">
          <span className="rounded-full w-[4px] h-[4px]" style={{ background: modelColor }} />
          {agent.defaultModel ?? t("agent_list.model_default")}
        </span>
        <span className="ml-auto font-[var(--font-mono)] text-[10.5px] text-txt-2 inline-flex items-center gap-1">
          <Icon name="activity" size={10} /> {t("agent_list.uses_count", { count: uses })}
        </span>
      </div>

      <div className="of-card-actions absolute flex gap-[3px] border opacity-0 top-[12px] right-[12px] p-[3px] bg-[var(--bg-elev)] border-line-2 rounded-[8px] [box-shadow:var(--shadow-2)] [transform:translateY(-2px)] transition-[opacity,transform] duration-[140ms] z-[2] group-hover:opacity-100 group-hover:[transform:translateY(0)]">
        <button
          type="button"
          className={`${ACCENT_BTN} inline-flex items-center font-semibold px-[10px] py-0 h-[26px] gap-[4px] text-[11.5px] rounded-[5px]`}
          onClick={e => { e.stopPropagation(); onOpen(); }}
        >
          <Icon name="send" size={11} /> Open
        </button>
        <button
          type="button"
          className="flex items-center justify-center text-txt-3 w-[26px] h-[26px] rounded-[5px] hover:bg-bg-3 hover:text-txt"
          title={t("agent_list.edit_title")}
          aria-label={t("agent_list.edit_aria", { name: agent.name })}
          onClick={e => { e.stopPropagation(); onEdit(); }}
        >
          <Icon name="edit" size={13} />
        </button>
      </div>
    </div>
  );
}
