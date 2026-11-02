"use client";

import { useRouter } from "next/navigation";
import { DropdownMenu, type DropdownItem } from "@/components/ui/dropdown-menu";
import { PAGE_ROUTES } from "@/lib/page-routes";
import { useGithubAccounts } from "@/modules/github-accounts/hooks/use-github-accounts";
import { useUpdateProject } from "../hooks/use-projects";
import { EnvControlTrigger, ENV_CONTROL_TRIGGER, type EnvIcon } from "./env-control";

const GITHUB_ICON: EnvIcon = { src: "/icons/github-rune.png", alt: "" };

/**
 * Per-project GitHub-account control — a button in the project Environment bar.
 *
 * `undefined` githubAccountId = the "default" account (system gh auth, no
 * `GH_CONFIG_DIR` injection). Selecting "Default" sends `githubAccountId: null`
 * to the API, which the projects service coerces to undefined and removes from
 * the frontmatter. The pinned account is the *only* GitHub identity wired into
 * the agent's env, so `git push` can't authenticate as the wrong one — this
 * control just makes that identity visible and changeable.
 */
export function ProjectGithubAccountPicker({
  projectId,
  currentGithubAccountId,
}: {
  projectId: string;
  currentGithubAccountId?: string | undefined;
}) {
  const accountsQ = useGithubAccounts();
  const update = useUpdateProject();
  const router = useRouter();

  const activeId = currentGithubAccountId ?? "default";
  const activeAccount = accountsQ.data?.find((a) => a.id === activeId);
  const activeLabel = activeAccount?.label ?? "Default";

  const handleChange = (nextId: string) => {
    const githubAccountId = nextId === "default" ? null : nextId;
    update.mutate({ id: projectId, patch: { meta: { githubAccountId } } });
  };

  const accessory = activeAccount?.username ? (
    <span className="text-[11px] text-txt-3 font-mono shrink-0">
      @{activeAccount.username}
    </span>
  ) : undefined;

  const trigger = (
    <EnvControlTrigger icon={GITHUB_ICON} label="GitHub" value={activeLabel} accessory={accessory} />
  );

  if (!accountsQ.data) {
    return (
      <div className={`flex items-center ${ENV_CONTROL_TRIGGER} opacity-70`}>
        <EnvControlTrigger icon={GITHUB_ICON} label="GitHub" value="…" />
      </div>
    );
  }

  const items: DropdownItem[] = accountsQ.data.map((a) => ({
    key: a.id,
    selected: a.id === activeId,
    indicatorStyle: "check",
    label: (
      <span className="flex-1 flex items-center gap-[9px] min-w-0">
        <span className="truncate">{a.label}</span>
        {a.username ? <span className="text-txt-3 font-mono font-normal text-[10.5px] truncate">@{a.username}</span> : null}
      </span>
    ),
    onSelect: () => handleChange(a.id),
  }));
  items.push({
    key: "__settings",
    label: (
      <span className="flex items-center gap-[6px] text-txt-3 font-medium">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/icons/cog.png" alt="" width={16} height={16} className="shrink-0 w-[16px] h-[16px] object-contain" /> Manage GitHub accounts…
      </span>
    ),
    onSelect: () => router.push(PAGE_ROUTES.settings),
  });

  return (
    <DropdownMenu
      align="start"
      ariaLabel="Select GitHub account"
      triggerClassName={ENV_CONTROL_TRIGGER}
      trigger={trigger}
      items={items}
      matchTriggerWidth
      variant="popover"
    />
  );
}
