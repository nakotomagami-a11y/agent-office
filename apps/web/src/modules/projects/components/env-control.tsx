import type { ReactNode } from "react";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/cn";

/**
 * Shared trigger class for the three project Environment controls (Claude
 * account, GitHub account, Secrets). Applied via `triggerClassName` on
 * `DropdownMenu` / `Popover`, whose base classes it overrides through
 * tailwind-merge. Gives every control one look: a bordered, hoverable button
 * that reads unmistakably as clickable — the opposite of the dim metadata text
 * these controls used to hide among.
 */
export const ENV_CONTROL_TRIGGER =
  "h-auto w-full rounded-[15px] px-[13px] py-[11px] gap-[12px] bg-card-2 border border-edge shadow-[var(--inset-hi)] text-txt " +
  "hover:border-edge-2 transition-colors duration-150 " +
  "focus-visible:outline-2 focus-visible:outline-acc focus-visible:outline-offset-2";

/** Per-control artistic icon — a standalone illustration, no badge/background. */
export type EnvIcon = { src: string; alt: string };

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
  icon: EnvIcon;
  label: string;
  value: ReactNode;
  accessory?: ReactNode;
}) {
  return (
    <span className="flex items-center gap-[12px] min-w-0 w-full">
      <EnvRowIcon icon={icon} />
      <EnvRowLabel label={label} value={value} />
      {accessory}
      <Icon name="chevron-down" size={12} className="text-txt-4 shrink-0" />
    </span>
  );
}

/**
 * Static (non-dropdown) Environment row — the mock renders each attached
 * secret this way: no chevron, because clicking it doesn't open a menu.
 * `trailing` carries the per-row status pill(s) instead of a chevron.
 */
export function EnvInfoRow({
  icon,
  label,
  value,
  trailing,
  className,
}: {
  icon: EnvIcon;
  label: string;
  value: ReactNode;
  trailing?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn(ENV_CONTROL_TRIGGER, "flex items-center gap-[12px]", className)}>
      <EnvRowIcon icon={icon} />
      <EnvRowLabel label={label} value={value} />
      {trailing}
    </div>
  );
}

function EnvRowIcon({ icon }: { icon: EnvIcon }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={icon.src} alt={icon.alt} width={32} height={32} className="shrink-0 object-contain" />
  );
}

function EnvRowLabel({ label, value }: { label: string; value: ReactNode }) {
  return (
    <span className="flex-1 flex flex-col items-start leading-tight min-w-0">
      <span className="text-[11px] text-txt-4">{label}</span>
      <span className="flex items-center gap-[6px] text-[13.5px] font-semibold text-txt max-w-[180px] truncate">{value}</span>
    </span>
  );
}
