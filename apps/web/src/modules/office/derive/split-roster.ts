import type { RosterGroupData } from "@/components/layout/roster-group";
import { COUNCIL_ROOM, categorize } from "@/modules/agents/form/categorize";

export interface RosterSections {
  pinnedList: RosterGroupData[];
  councilList: RosterGroupData[];
  restList: RosterGroupData[];
}

/**
 * Split the roster into the three sidebar sections, in render order.
 *
 * Pinning wins over the Council room so a pinned chair is listed once, not
 * twice. Membership goes through `categorize` rather than comparing `room`
 * directly — `room` is free-form (ClassPicker accepts a typed value, and the
 * frontmatter is hand-editable), so " Council" and "council" must not fall
 * through to the rest section while the agent's own hover card calls it one.
 */
export function splitRoster({ groups, filter, pinnedIds }: {
  groups: RosterGroupData[];
  filter: string;
  pinnedIds: string[];
}): RosterSections {
  const base = filter
    ? groups.filter((g) => g.agent.name.toLowerCase().includes(filter.toLowerCase()))
    : groups;
  const unpinned = base.filter((g) => !pinnedIds.includes(g.agentId));
  const isCouncil = (g: RosterGroupData) =>
    categorize(g.agent).toLowerCase() === COUNCIL_ROOM.toLowerCase();
  return {
    pinnedList: base.filter((g) => pinnedIds.includes(g.agentId)),
    councilList: unpinned.filter(isCouncil),
    restList: unpinned.filter((g) => !isCouncil(g)),
  };
}
