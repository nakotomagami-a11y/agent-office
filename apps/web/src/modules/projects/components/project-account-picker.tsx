"use client";

import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui/icon";
import { DropdownMenu, type DropdownItem } from "@/components/ui/dropdown-menu";
import { PAGE_ROUTES } from "@agent-office/domain/config/routes";
import { useAccounts } from "@/modules/accounts/hooks/use-accounts";
import { PlanBadge } from "@/modules/accounts/components/plan-badge";
import { useUpdateProject } from "../hooks/use-projects";
import { EnvControlTrigger, ENV_CONTROL_TRIGGER, type EnvIcon } from "./env-control";

const CLAUDE_ICON: EnvIcon = { src: "/icons/claude-rune.png", alt: "" };

/**
 * Per-project Claude-account control — a button in the project Environment bar.
 *
 * `undefined` accountId = the "default" account (i.e. `~/.claude`). Selecting
 * "Default" from the dropdown sends `accountId: null` to the API, which the
 * projects service coerces to undefined and removes from the frontmatter.
 *
 * Unlike the old dim-text chip, this always renders as an obvious control — even
 * with a single account, where the menu's only real job is a "Manage in
 * Settings" shortcut. Consistency over cleverness: the user should never wonder
 * whether the account is clickable.
 */
export function ProjectAccountPicker({
  projectId,
  currentAccountId,
}: {
  projectId: string;
  currentAccountId?: string | undefined;
}) {
  const accountsQ = useAccounts();
  const update = useUpdateProject();
  const router = useRouter();

  const activeId = currentAccountId ?? "default";
  const activeAccount = accountsQ.data?.find((a) => a.id === activeId);
  const activeLabel = activeAccount?.label ?? "Default";

  const handleChange = (nextId: string) => {
    const accountId = nextId === "default" ? null : nextId;
    update.mutate({ id: projectId, patch: { meta: { accountId } } });
  };

  const accessory = activeAccount ? (
    <PlanBadge plan={activeAccount.plan} className="h-[15px] text-[9px] px-[5px] shrink-0" />
  ) : undefined;

  const trigger = (
    <EnvControlTrigger icon={CLAUDE_ICON} label="Claude account" value={activeLabel} accessory={accessory} />
  );

  // Still loading — render the same shell so the bar doesn't jump.
  if (!accountsQ.data) {
    return (
      <div className={`flex items-center ${ENV_CONTROL_TRIGGER} opacity-70`}>
        <EnvControlTrigger icon={CLAUDE_ICON} label="Claude account" value="…" />
      </div>
    );
  }

  const items: DropdownItem[] = accountsQ.data.map((a) => ({
    key: a.id,
    selected: a.id === activeId,
    indicatorStyle: "check",
    label: (
      <span className="flex items-center gap-[8px]">
        <span>{a.label}</span>
        <PlanBadge plan={a.plan} className="h-[14px] text-[9px] px-[4px]" />
      </span>
    ),
    onSelect: () => handleChange(a.id),
  }));
  items.push({
    key: "__settings",
    label: (
      <span className="flex items-center gap-[6px] text-txt-2">
        <Icon name="settings" size={12} /> Manage accounts…
      </span>
    ),
    onSelect: () => router.push(PAGE_ROUTES.settings),
  });

  return (
    <DropdownMenu
      align="start"
      ariaLabel="Select Claude account"
      triggerClassName={ENV_CONTROL_TRIGGER}
      trigger={trigger}
      items={items}
      matchTriggerWidth
    />
  );
}
