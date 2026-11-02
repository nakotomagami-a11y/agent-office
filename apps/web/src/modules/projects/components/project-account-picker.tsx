"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { DropdownMenu, type DropdownItem } from "@/components/ui/dropdown-menu";
import { PAGE_ROUTES } from "@/lib/page-routes";
import { useAccounts } from "@/modules/accounts/hooks/use-accounts";
import { useActiveProvider } from "@/modules/providers/hooks/use-providers";
import { useUpdateProject } from "../hooks/use-projects";
import type { ClaudePlan } from "@agent-office/domain/types";
import { EnvControlTrigger, EnvPill, ENV_CONTROL_TRIGGER, type EnvIcon } from "./env-control";

const CLAUDE_ICON: EnvIcon = { src: "/icons/claude-account-rune.png", alt: "" };

const PlanPill = ({ plan, small }: { plan: ClaudePlan; small?: boolean }) => (
  <EnvPill tone={plan === "max" ? "good" : "muted"} small={small}>{plan}</EnvPill>
);

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
  const t = useTranslations("providers");
  // The config dir holds sessions for every provider, so the picker stays; the plan is subscription-only.
  const { id: providerId } = useActiveProvider();
  const subscription = providerId === "subscription";
  const pickerLabel = subscription ? "Claude account" : t("account_label_sessions");

  const activeId = currentAccountId ?? "default";
  const activeAccount = accountsQ.data?.find((a) => a.id === activeId);
  const activeLabel = activeAccount?.label ?? "Default";

  const handleChange = (nextId: string) => {
    const accountId = nextId === "default" ? null : nextId;
    update.mutate({ id: projectId, patch: { meta: { accountId } } });
  };

  const accessory = activeAccount && subscription ? (
    <PlanPill plan={activeAccount.plan} />
  ) : undefined;

  const trigger = (
    <EnvControlTrigger icon={CLAUDE_ICON} label={pickerLabel} value={activeLabel} accessory={accessory} />
  );

  // Still loading — render the same shell so the bar doesn't jump.
  if (!accountsQ.data) {
    return (
      <div className={`flex items-center ${ENV_CONTROL_TRIGGER} opacity-70`}>
        <EnvControlTrigger icon={CLAUDE_ICON} label={pickerLabel} value="…" />
      </div>
    );
  }

  const items: DropdownItem[] = accountsQ.data.map((a) => ({
    key: a.id,
    selected: a.id === activeId,
    indicatorStyle: "check",
    label: (
      <span className="flex-1 flex items-center gap-[9px] min-w-0">
        <span className="flex-1 truncate">{a.label}</span>
        {subscription ? <PlanPill plan={a.plan} small /> : null}
      </span>
    ),
    onSelect: () => handleChange(a.id),
  }));
  items.push({
    key: "__settings",
    label: (
      <span className="flex items-center gap-[6px] text-txt-3 font-medium">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/icons/cog.png" alt="" width={16} height={16} className="shrink-0 w-[16px] h-[16px] object-contain" /> Manage accounts…
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
      variant="popover"
    />
  );
}
