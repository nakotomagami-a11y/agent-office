"use client";

import { useTranslations } from "next-intl";
import { AgentAvatar } from "@/components/ui/agent-avatar";
import { unitForAgent } from "@/components/ui/unit-sprite-registry";
import { formatAgentDisplayName } from "@/lib/agent-display-name";

export type StarterAgent = {
  id: string;
  name: string;
  description: string;
  unit?: string;
};

export type AgentsStepProps = {
  starter: StarterAgent[];
  loading: boolean;
  selected: Set<string>;
  onToggle: (id: string) => void;
  onToggleAll: () => void;
};

/** Wizard step 4: pick which bundled starter agents to import. */
export function AgentsStep({ starter, loading, selected, onToggle, onToggleAll }: AgentsStepProps) {
  const t = useTranslations();
  return (
    <section>
      <h3 className="font-semibold m-0 mb-[6px] text-[15px]">{t("first_run.agents_title")}</h3>
      <p className="text-txt-3 m-0 mb-[12px] text-[12.5px] leading-[1.5]">{t("first_run.agents_hint")}</p>
      {loading ? (
        <p>{t("common.loading")}</p>
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
  return (
    <>
      <label className="flex items-start cursor-pointer gap-[10px] px-[10px] py-[8px] rounded-[6px] transition-[background] duration-[80ms] bg-acc-faint mb-[6px] border border-dashed border-[var(--acc)]">
        <input
          type="checkbox"
          className="mt-[3px]"
          checked={selected.size === starter.length && starter.length > 0}
          onChange={onToggleAll}
        />
        <span className="font-medium text-[13px]">
          {t("first_run.agents_select_all", { count: starter.length })}
        </span>
      </label>
      <div className="flex flex-col overflow-y-auto border border-line-2 gap-[4px] max-h-[320px] rounded-[8px] p-[4px]">
        {starter.map((a) => (
          <AgentCheckbox key={a.id} agent={a} checked={selected.has(a.id)} onToggle={() => onToggle(a.id)} />
        ))}
      </div>
    </>
  );
}

function AgentCheckbox({ agent, checked, onToggle }: { agent: StarterAgent; checked: boolean; onToggle: () => void }) {
  const unit = unitForAgent(agent.name, agent.unit);
  const displayName = formatAgentDisplayName(agent.id);
  return (
    <label className="flex items-center cursor-pointer gap-[10px] px-[10px] py-[8px] rounded-[6px] transition-[background] duration-[80ms] hover:bg-bg-2">
      <input type="checkbox" className="shrink-0" checked={checked} onChange={onToggle} />
      <AgentAvatar unit={unit} size={40} label={displayName} />
      <div className="min-w-0">
        <div className="font-medium text-[13px]">{displayName}</div>
        <div className="text-txt-3 text-[11.5px] mt-[2px] leading-[1.4]">{agent.description}</div>
      </div>
    </label>
  );
}
