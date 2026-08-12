"use client";

import { useState } from "react";
import { match } from "ts-pattern";
import { useTranslations } from "next-intl";
import { Card } from "@/components/ui/card";
import { CardHeader } from "@/components/ui/card-header";
import { Tag } from "@/components/ui/tag";
import { Tabs } from "@/components/ui/tabs";
import { Icon } from "@/components/ui/icon";
import { Skeleton } from "@/components/ui/skeleton";
import { CodeBlock } from "@/components/ui/code-block";
import { UnitSprite } from "@/components/ui/unit-sprite";
import { unitForAgent } from "@/components/ui/unit-sprite-registry";
import { formatAgentDisplayName } from "@/lib/agent-display-name";
import { PAGE_ROUTES } from "@agent-office/domain/config/routes";
import { useAgent, useAgentBody, useAgentMemory, useWriteAgentMemory } from "../hooks/use-agents";
import { ActivityFeed } from "@/modules/runs/components/activity-feed";
import { useSummonStore } from "@/modules/summon/hooks/use-summon-store";
import { useActiveProjectStore } from "@/lib/active-project-store";
import { MemoryEditor } from "@/modules/memory/components/memory-editor";
import { Button } from "@/components/ui/button";

export type AgentDetailProps = { id: string };

type TabValue = "prompt" | "memory" | "runs";

export function AgentDetail({ id }: AgentDetailProps) {
  const t = useTranslations();
  const [tab, setTab] = useState<TabValue>("prompt");
  const agentQ = useAgent(id);
  const bodyQ = useAgentBody(id);

  const openChat = useSummonStore((s) => s.openChat);
  const activeProjectId = useActiveProjectStore((s) => s.id);

  if (agentQ.isLoading) {
    return (
      <div className="overflow-auto py-[18px] px-6">
        <Skeleton width={240} height={28} />
        <div className="h-3" />
        <Skeleton width="100%" height={200} />
      </div>
    );
  }
  if (!agentQ.data) {
    return <div className="overflow-auto py-[18px] px-6">{t("errors.not_found")}</div>;
  }
  const agent = agentQ.data;
  const unit = unitForAgent(id, agent.unit);

  return (
    <div className="overflow-auto py-[18px] px-6 flex flex-col gap-[14px]">
      <Card>
        <div className="flex items-center gap-[14px] p-4">
          <div className="w-14 h-14 shrink-0">
            <UnitSprite unit={unit} size={56} animate />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="m-0 text-[18px] font-bold tracking-[-0.01em]">{formatAgentDisplayName(agent.name)}</h2>
            <div className="text-xs text-txt-3 font-mono">{id}</div>
            <div className="text-[13px] text-txt-2 mt-1">{agent.description || t("agent_list.description_empty")}</div>
          </div>
          <div className="flex gap-2">
            <Button variant="primary" onClick={() => openChat(id, { projectId: activeProjectId ?? undefined })}>
              <Icon name="send" /> {t("summon.open_chat")}
            </Button>
            <Button href={PAGE_ROUTES.agentEdit(id)}>
              <Icon name="edit" /> {t("common.edit")}
            </Button>
          </div>
        </div>
        <div className="px-4 pb-[14px] flex gap-[6px] flex-wrap">
          {agent.skills.map((s) => (
            <Tag key={s} variant="skill">#{s}</Tag>
          ))}
          {agent.skills.length === 0 ? <span className="text-xs text-txt-3">{t("agent_details.no_skills")}</span> : null}
          <span className="flex-1" />
          <Tag>{t("agent_details.tag_model", { model: agent.defaultModel ?? t("agent_details.tag_default") })}</Tag>
          <Tag>{t("agent_details.tag_effort", { effort: agent.defaultEffort ?? t("agent_details.tag_default") })}</Tag>
          <Tag>{t("agent_details.tag_tools", { count: agent.tools.length })}</Tag>
        </div>
      </Card>

      <Tabs<TabValue>
        items={[
          { value: "prompt", label: t("agent_details.tab_prompt") },
          { value: "memory", label: t("agent_details.tab_memory") },
          { value: "runs", label: t("agent_details.tab_runs") },
        ]}
        value={tab}
        onChange={setTab}
        ariaLabel={t("agent_details.tabs_aria")}
      />

      {match(tab)
        .with("prompt", () => (
          <Card>
            <CardHeader title={t("agent_details.prompt_card_title")} sub={`~/.claude/agents/${id}.md`} />
            <div className="p-4">
              {bodyQ.isLoading ? (
                <Skeleton width="100%" height={200} />
              ) : (
                <CodeBlock body={bodyQ.data ?? ""} lang="markdown" />
              )}
            </div>
          </Card>
        ))
        .with("memory", () => <AgentMemoryCard id={id} />)
        .with("runs", () => <ActivityFeed agentId={id} />)
        .exhaustive()}
    </div>
  );
}

function AgentMemoryCard({ id }: { id: string }) {
  const t = useTranslations();
  const memoryQ = useAgentMemory(id);
  const writeMut = useWriteAgentMemory();

  if (memoryQ.isLoading) return <Skeleton width="100%" height={200} />;

  return (
    <Card>
      <CardHeader
        title={t("agent_details.memory_card_title")}
        sub={`~/.claude/agents/${id}.memory.md`}
      />
      <div className="p-4">
        <MemoryEditor
          value={memoryQ.data ?? ""}
          onSave={(content) => writeMut.mutateAsync({ id, content })}
          rows={14}
          placeholder={t("agent_details.memory_placeholder")}
          saveLabel={t("common.save")}
        />
      </div>
    </Card>
  );
}
