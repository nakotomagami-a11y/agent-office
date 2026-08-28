import { useState, type ReactNode } from "react";
import type { ScheduledJob } from "@agent-office/domain/types";
import { Icon } from "@/components/ui/icon";
import { Button } from "@/components/ui/button";
import { TextInput } from "@/components/ui/text-input";
import { DropdownMenu, type DropdownItem } from "@/components/ui/dropdown-menu";
import { AgentAvatar } from "@/components/ui/agent-avatar";
import type { UnitSelection } from "@/components/ui/unit-sprite-registry";
import { agentDisplayName } from "@/lib/agent-display-name";
import { useOfficeAgents } from "@/modules/office/hooks/use-office-agents";
import { useReassignSchedule } from "../hooks/use-schedules";

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-[6px] min-w-0">
      <span className="text-[10.5px] font-mono tracking-[0.06em] text-txt-4 uppercase">{label}</span>
      {children}
    </label>
  );
}

/** Custom dropdown styled as a form field — replaces the native `<select>`
 * (whose OS popup clashed with the app). */
export function PickerField({
  display,
  placeholder,
  items,
  ariaLabel,
  width,
}: {
  display: ReactNode;
  placeholder?: string;
  items: DropdownItem[];
  ariaLabel: string;
  width?: string;
}) {
  return (
    <DropdownMenu
      ariaLabel={ariaLabel}
      align="start"
      className={`block ${width ?? "w-[200px]"}`}
      triggerClassName="w-full h-8 px-[10px] justify-between bg-card-2 border border-edge rounded-[10px] shadow-[var(--inset-hi)] text-txt text-[13px] hover:border-acc-line"
      trigger={
        <>
          <span className="flex items-center gap-[7px] min-w-0 truncate">
            {display ?? <span className="text-txt-4">{placeholder}</span>}
          </span>
          <Icon name="chevron-down" size={14} className="text-txt-4 shrink-0" />
        </>
      }
      items={items}
    />
  );
}

export function agentItems(
  agents: { id: string; name: string; unitChoice: UnitSelection }[],
  selectedId: string,
  onPick: (id: string) => void,
): DropdownItem[] {
  return agents.map((a) => ({
    key: a.id,
    selected: a.id === selectedId,
    onSelect: () => onPick(a.id),
    label: (
      <span className="flex items-center gap-[9px] min-w-0">
        <AgentAvatar unit={a.unitChoice} size={20} className="rounded" />
        <span className="truncate">{agentDisplayName(a)}</span>
      </span>
    ),
  }));
}

export function agentDisplay(agent: { name: string; unitChoice: UnitSelection } | undefined): ReactNode {
  if (!agent) return null;
  return (
    <>
      <AgentAvatar unit={agent.unitChoice} size={20} className="rounded shrink-0" />
      <span className="truncate">{agentDisplayName(agent)}</span>
    </>
  );
}

export function ScheduleReassignRow({ job, onDone }: { job: ScheduledJob; onDone: () => void }) {
  const { agents } = useOfficeAgents();
  const reassign = useReassignSchedule();
  const [agentId, setAgentId] = useState(job.summonRequest.agentId);
  const [instanceId, setInstanceId] = useState(job.summonRequest.instanceId ?? "");

  return (
    <div className="flex items-end gap-2 flex-wrap border-t border-edge pt-[12px]">
      <Field label="Agent">
        <PickerField
          ariaLabel="Choose agent"
          width="w-[200px]"
          placeholder="Pick an agent"
          display={agentDisplay(agents.find((a) => a.id === agentId))}
          items={agentItems(agents, agentId, setAgentId)}
        />
      </Field>
      <Field label="Instance">
        <TextInput value={instanceId} onChange={(e) => setInstanceId(e.target.value)} placeholder="default" className="w-[140px]" />
      </Field>
      <Button
        size="sm"
        variant="primary"
        onClick={() => {
          reassign.mutate({ id: job.id, target: { agentId, instanceId: instanceId || undefined } });
          onDone();
        }}
      >
        Save
      </Button>
      <Button size="sm" variant="ghost" onClick={onDone}>
        Cancel
      </Button>
    </div>
  );
}

