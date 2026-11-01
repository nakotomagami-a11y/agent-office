import type { DropdownItem } from "@/components/ui/dropdown-menu";
import { AgentAvatar } from "@/components/ui/agent-avatar";
import type { UnitSelection } from "@/components/ui/unit-sprite-registry";
import { agentDisplayName } from "@/lib/agent-display-name";

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
