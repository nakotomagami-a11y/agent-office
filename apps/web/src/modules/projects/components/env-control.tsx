import type { ReactNode } from "react";
import { Icon, type IconName } from "@/components/ui/icon";

/**
 * Shared trigger class for the three project Environment controls (Claude
 * account, GitHub account, Secrets). Applied via `triggerClassName` on
 * `DropdownMenu` / `Popover`, whose base classes it overrides through
 * tailwind-merge. Gives every control one look: a bordered, hoverable button
 * that reads unmistakably as clickable — the opposite of the dim metadata text
 * these controls used to hide among.
 */
export const ENV_CONTROL_TRIGGER =
  "h-auto rounded-[10px] px-[10px] py-[7px] gap-[10px] bg-bg-2 border border-line text-txt " +
  "hover:bg-bg-3 hover:border-line-2 transition-colors duration-100 " +
  "focus-visible:outline-2 focus-visible:outline-acc focus-visible:outline-offset-2";

/**
 * Inner content of an Environment control button: an icon badge, a stacked
 * micro-label + value, an optional trailing accessory (plan badge, @username),
 * and a chevron. Presentational only — the surrounding button/aria is owned by
 * the DropdownMenu or Popover this is passed to as `trigger`.
 */
export function EnvControlTrigger({
  icon,
  label,
  value,
  accessory,
}: {
  icon: IconName;
  label: string;
  value: ReactNode;
  accessory?: ReactNode;
}) {
  return (
    <span className="flex items-center gap-[10px] min-w-0">
      <span className="flex items-center justify-center w-[28px] h-[28px] rounded-[8px] bg-bg-1 border border-line text-txt-2 shrink-0">
        <Icon name={icon} size={14} />
      </span>
      <span className="flex flex-col items-start leading-tight min-w-0">
        <span className="text-[9.5px] font-semibold uppercase tracking-[0.07em] text-txt-3 font-[var(--font-mono)]">
          {label}
        </span>
        <span className="flex items-center gap-[6px] text-[12.5px] font-semibold text-txt max-w-[180px] truncate">
          {value}
        </span>
      </span>
      {accessory}
      <Icon name="chevron-down" size={12} className="text-txt-3 shrink-0 ml-[2px]" />
    </span>
  );
}
