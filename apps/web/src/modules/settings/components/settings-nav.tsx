"use client";

import { Icon, type IconName } from "@/components/ui/icon";
import { cn } from "@/lib/cn";

/**
 * Grouped left navigation for the Settings surface.
 *
 * Desktop (>=640px): a vertical, labelled nav with a right border, one column.
 * Mobile  (<640px):  the whole shell flips to a column and this becomes a
 * horizontal, scrollable strip of items (flexbox — no grid, house rule); the
 * mono group labels drop out and groups are divided by a thin rule instead.
 */

export type SettingsTabValue =
  | "projects"
  | "bundled-agents"
  | "accounts"
  | "github-accounts"
  | "secrets"
  | "about-you"
  | "performance"
  | "cleanup";

type NavItem = { value: SettingsTabValue; label: string; icon: IconName };
type NavGroup = { label: string; items: NavItem[] };

const GROUPS: NavGroup[] = [
  {
    label: "Workspace",
    items: [
      { value: "projects", label: "Projects", icon: "folder" },
      { value: "bundled-agents", label: "Bundled agents", icon: "sparkle" },
    ],
  },
  {
    label: "Accounts",
    items: [
      { value: "accounts", label: "Claude accounts", icon: "users" },
      { value: "github-accounts", label: "GitHub accounts", icon: "branch" },
      { value: "secrets", label: "Secrets", icon: "lock" },
    ],
  },
  {
    label: "You",
    items: [{ value: "about-you", label: "About You", icon: "identity" }],
  },
  {
    label: "System",
    items: [
      { value: "performance", label: "Performance", icon: "gauge" },
      { value: "cleanup", label: "Cleanup", icon: "trash" },
    ],
  },
];

export function SettingsNav({
  value,
  onChange,
  ariaLabel,
}: {
  value: SettingsTabValue;
  onChange: (next: SettingsTabValue) => void;
  ariaLabel: string;
}) {
  return (
    <nav
      aria-label={ariaLabel}
      className={cn(
        // Desktop: vertical rail
        "shrink-0 w-[210px] px-[12px] py-[16px] border-r border-line overflow-y-auto",
        "flex flex-col gap-[18px]",
        // Mobile: horizontal scroll strip
        "max-[640px]:w-full max-[640px]:flex-row max-[640px]:items-center max-[640px]:gap-0",
        "max-[640px]:border-r-0 max-[640px]:border-b max-[640px]:overflow-x-auto max-[640px]:overflow-y-hidden",
        "max-[640px]:py-[8px] max-[640px]:px-[10px]",
      )}
    >
      {GROUPS.map((group) => (
        <div
          key={group.label}
          className={cn(
            "flex flex-col gap-[2px]",
            // Mobile: lay items in a row, divide groups with a rule
            "max-[640px]:flex-row max-[640px]:gap-[4px] max-[640px]:shrink-0",
            "max-[640px]:border-l max-[640px]:border-line max-[640px]:pl-[10px] max-[640px]:ml-[10px]",
            "max-[640px]:first:border-l-0 max-[640px]:first:pl-0 max-[640px]:first:ml-0",
          )}
        >
          <div className="px-[10px] pb-[2px] text-[10px] font-[var(--font-mono)] uppercase tracking-[0.08em] text-txt-3 max-[640px]:hidden">
            {group.label}
          </div>
          {group.items.map((item) => {
            const active = item.value === value;
            return (
              <button
                key={item.value}
                type="button"
                aria-current={active ? "page" : undefined}
                onClick={() => onChange(item.value)}
                className={cn(
                  "flex items-center gap-[9px] h-[32px] px-[10px] rounded-[8px] w-full text-left",
                  "text-[13px] whitespace-nowrap cursor-pointer border border-transparent",
                  "transition-[background-color,color] duration-[120ms]",
                  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-acc",
                  "max-[640px]:w-auto max-[640px]:shrink-0",
                  active
                    ? "bg-acc-faint text-acc font-medium border-[var(--acc-tint)]"
                    : "text-txt-3 hover:text-txt hover:bg-bg-2",
                )}
              >
                <Icon name={item.icon} size={15} className="shrink-0" />
                {item.label}
              </button>
            );
          })}
        </div>
      ))}
    </nav>
  );
}
