"use client";

import { useTranslations } from "next-intl";
import { AgentAvatar } from "@/components/ui/agent-avatar";
import { Checkbox } from "@/components/ui/checkbox";
import { unitForAgent } from "@/components/ui/unit-sprite-registry";
import { formatAgentDisplayName } from "@/lib/agent-display-name";
import { categoryColor } from "@/modules/agents/form/categorize";
import { cn } from "@/lib/cn";

export type StarterAgent = {
  id: string;
  name: string;
  description: string;
  unit?: string;
  room?: string;
};

export type AgentsStepProps = {
  starter: StarterAgent[];
  loading: boolean;
  selected: Set<string>;
  onToggle: (id: string) => void;
  onToggleAll: () => void;
};

/** Wizard step 5: pick which bundled starter agents to import. */
export function AgentsStep({ starter, loading, selected, onToggle, onToggleAll }: AgentsStepProps) {
  const t = useTranslations();
  return (
    <section>
      <h3 className="m-0 text-[16.5px] font-extrabold tracking-[-0.025em]">{t("first_run.agents_title")}</h3>
      <p className="m-0 mt-[6px] max-w-[560px] text-[12.5px] leading-[1.6] text-txt-3 text-pretty">
        {t("first_run.agents_hint")}
      </p>
      {loading ? (
        <p className="mt-4 text-[12.5px] text-txt-3">{t("common.loading")}</p>
      ) : (
        <AgentList starter={starter} selected={selected} onToggle={onToggle} onToggleAll={onToggleAll} />
      )}
    </section>
  );
}

function AgentList({ starter, selected, onToggle, onToggleAll }: {
  starter: StarterAgent[];
  selected: Set<string>;
  onToggle: (id: string) => void;
  onToggleAll: () => void;
}) {
  const t = useTranslations();
  const allSelected = selected.size === starter.length && starter.length > 0;
  return (
    <>
      <label
        className={cn(
          "mt-4 flex cursor-pointer items-center gap-[10px] rounded-2xl border px-[14px] py-[11px]",
          allSelected ? "border-acc-line bg-acc-soft" : "border-edge bg-card",
        )}
      >
        <Checkbox checked={allSelected} onChange={onToggleAll} />
        <span className="flex-1 text-[13px] font-bold">
          {t("first_run.agents_select_all", { count: starter.length })}
        </span>
        <span className="font-mono text-[11px] text-txt-4">
          {t("first_run.agents_selected_count", { count: selected.size })}
        </span>
      </label>

      <div className="mt-[10px] flex max-h-[320px] flex-col gap-[5px] overflow-y-auto">
        {starter.map((a) => (
          <AgentRow key={a.id} agent={a} checked={selected.has(a.id)} onToggle={() => onToggle(a.id)} />
        ))}
      </div>
    </>
  );
}

function AgentRow({ agent, checked, onToggle }: { agent: StarterAgent; checked: boolean; onToggle: () => void }) {
  const unit = unitForAgent(agent.name, agent.unit);
  const displayName = formatAgentDisplayName(agent.id);
  const category = agent.room?.trim();
  const catColor = category ? categoryColor(category) : null;

  return (
    <label
      className={cn(
        "flex cursor-pointer items-center gap-[11px] rounded-2xl border px-[13px] py-[10px] transition-colors",
        checked ? "border-acc-line bg-acc-soft" : "border-edge bg-card",
      )}
    >
      <Checkbox checked={checked} onChange={onToggle} />
      <AgentAvatar unit={unit} size={40} label={displayName} />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-[7px]">
          <span className="text-[12.5px] font-bold">{displayName}</span>
          <span className="truncate font-mono text-[10.5px] text-txt-4">{agent.id}</span>
        </div>
        <div className="mt-[2px] truncate text-[11px] leading-[1.4] text-txt-3">{agent.description}</div>
      </div>
      {category && catColor ? (
        <span
          className="shrink-0 rounded-full px-[8px] py-[2px] font-mono text-[9px] font-extrabold uppercase tracking-[0.05em]"
          style={{ background: `color-mix(in srgb, ${catColor} 16%, transparent)`, color: catColor }}
        >
          {category}
        </span>
      ) : null}
    </label>
  );
}
