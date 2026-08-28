"use client";

import { useTranslations } from "next-intl";
import { Icon, type IconName } from "@/components/ui/icon";
import { cn } from "@/lib/cn";
import { useIntegrationEnabled } from "../hooks/use-settings";

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
  | "integrations"
  | "secrets"
  | "about-you"
  | "performance"
  | "cleanup";

// `label`/group `key` below are i18n key stems (see `settings_nav.*` in
// messages/en.json) — translated at render time, not display strings.
type NavItem = { value: SettingsTabValue; icon: IconName };
type NavGroup = { key: string; items: NavItem[] };

const GROUPS: NavGroup[] = [
  {
    key: "workspace",
    items: [
      { value: "projects", icon: "folder" },
      { value: "bundled-agents", icon: "sparkle" },
      { value: "integrations", icon: "wrench" },
    ],
  },
  {
    key: "credentials",
    items: [
      { value: "secrets", icon: "lock" },
    ],
  },
  {
    key: "you",
    items: [{ value: "about-you", icon: "identity" }],
  },
  {
    key: "system",
    items: [
      { value: "performance", icon: "gauge" },
      { value: "cleanup", icon: "trash" },
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
  const t = useTranslations("settings_nav");
  // Some nav items belong to an optional integration and are hidden when it's off.
  const navEnabled: Partial<Record<SettingsTabValue, boolean>> = {
    "about-you": useIntegrationEnabled("about-you"),
  };
  const groups = GROUPS
    .map((g) => ({ ...g, items: g.items.filter((it) => navEnabled[it.value] ?? true) }))
    .filter((g) => g.items.length > 0);

  return (
    <nav
      aria-label={ariaLabel}
      className={cn(
        // Desktop: vertical rail — surface-sheen card, not a bordered pane.
        // Exact mockup values: padding:12px 10px; border-radius:22px.
        "shrink-0 w-[212px] surface-sheen rounded-[22px] shadow-[var(--lift)] py-[12px] px-[10px] overflow-y-auto",
        "flex flex-col gap-[2px]",
        // Mobile: horizontal scroll strip
        "max-[640px]:w-full max-[640px]:flex-row max-[640px]:items-center max-[640px]:gap-0",
        "max-[640px]:rounded-[14px] max-[640px]:overflow-x-auto max-[640px]:overflow-y-hidden",
        "max-[640px]:py-[8px] max-[640px]:px-[10px]",
      )}
    >
      {groups.map((group) => (
        <div
          key={group.key}
          className={cn(
            "flex flex-col gap-[2px]",
            // Mobile: lay items in a row, divide groups with a rule
            "max-[640px]:flex-row max-[640px]:gap-[4px] max-[640px]:shrink-0",
            "max-[640px]:border-l max-[640px]:border-line max-[640px]:pl-[10px] max-[640px]:ml-[10px]",
            "max-[640px]:first:border-l-0 max-[640px]:first:pl-0 max-[640px]:first:ml-0",
          )}
        >
          <div className="flex items-center gap-[8px] pt-[12px] px-[8px] pb-[6px] max-[640px]:hidden">
            <span className="text-[9px] font-extrabold font-[var(--font-mono)] uppercase tracking-[0.1em] text-txt-4 whitespace-nowrap">
              {t(`group_${group.key}_label`)}
            </span>
            <span className="flex-1 h-px bg-edge" aria-hidden />
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
                  "flex items-center gap-[10px] py-[8px] px-[10px] rounded-[12px] w-full text-left",
                  "text-[12.5px] whitespace-nowrap cursor-pointer transition-colors duration-150",
                  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-acc",
                  "max-[640px]:w-auto max-[640px]:shrink-0",
                  active ? "bg-acc-soft text-acc font-bold" : "text-txt-2 hover:bg-card-2",
                )}
              >
                <Icon name={item.icon} size={14} className="shrink-0 opacity-90" />
                {t(`nav_${item.value.replace(/-/g, "_")}_label`)}
              </button>
            );
          })}
        </div>
      ))}
    </nav>
  );
}
