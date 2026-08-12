"use client";

import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import { UnitSprite } from "@/components/ui/unit-sprite";
import { Icon } from "@/components/ui/icon";
import { formatAgentDisplayName } from "@/lib/agent-display-name";
import type { OfficeAgent } from "@/modules/office/hooks/use-office-agents";

export type ChatHeadProps = {
  agent: OfficeAgent;
  onNew?: () => void;
  /** Extra controls rendered to the left of the "New" button (e.g. Workflow pill). */
  actions?: ReactNode;
};

export function ChatHead({ agent, onNew, actions }: ChatHeadProps) {
  const t = useTranslations();
  return (
    <div className="flex items-center gap-3 px-[18px] py-3 border-b border-[var(--line)]">
      <div className="w-[40px] h-[40px]">
        <UnitSprite
          unit={agent.unitChoice}
          size={40}
          action={agent.status === "working" || agent.status === "thinking" ? "working" : "idle"}
          animate
        />
      </div>
      <div>
        <h2 className="m-0 text-[15px] font-bold tracking-[-0.01em]">{formatAgentDisplayName(agent.name)}</h2>
        <div className="text-[11.5px] text-[var(--txt-3)] font-[var(--font-mono)]">
          {t("chat_head.sub", {
            id: agent.id,
            model: agent.defaultModel ?? t("chat_head.model_default"),
            effort: agent.defaultEffort ?? t("chat_head.effort_default"),
          })}
        </div>
      </div>
      <div className="ml-auto flex items-center gap-[8px]">
        {actions}
        <button
          type="button"
          className="inline-flex items-center gap-[6px] h-7 px-[10px] rounded-lg bg-ao-bg-3 border border-ao-line-1 text-ao-fg-1 text-[13px] transition-[background,color,border-color] duration-[120ms] hover:bg-ao-bg-4 hover:text-ao-fg-0 hover:border-ao-line-2 disabled:opacity-40 disabled:cursor-default"
          onClick={onNew}
          disabled={!onNew}
        >
          <Icon name="plus" size={13} /> {t("chat_head.new_button")}
        </button>
      </div>
    </div>
  );
}
