import type { ReactNode } from "react";
import Link from "next/link";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/cn";

/** The proposal's Environment-row lift: brighter edge and fill, 1px rise, a soft drop; pressing settles it. */
export const ENV_ROW_LIFT =
  "[transition:border-color_180ms_ease,background-color_180ms_ease,transform_180ms_cubic-bezier(.2,.8,.2,1),box-shadow_180ms_ease] " +
  "hover:border-edge-2 hover:bg-card-3 hover:-translate-y-px hover:shadow-[var(--inset-hi),0_10px_24px_-16px_rgba(0,0,0,.9)] " +
  "active:translate-y-0 active:bg-card-2";

/**
 * Shared trigger class for the Environment controls, passed as `triggerClassName` to `DropdownMenu`,
 * whose base classes it overrides through tailwind-merge.
 */
export const ENV_CONTROL_TRIGGER =
  "h-auto w-full rounded-[15px] px-[13px] py-[11px] gap-[12px] bg-card-2 border border-edge shadow-[var(--inset-hi)] text-txt " +
  ENV_ROW_LIFT +
  " focus-visible:outline-2 focus-visible:outline-acc focus-visible:outline-offset-2";

/** Per-control artistic icon — a standalone illustration, no badge/background. */
export type EnvIcon = { src: string; alt: string };

/** The card-header text link ("Manage", "Edit"): accent text that gains an accent wash on hover. */
export const ENV_HEADER_LINK =
  "flex items-center gap-[4px] px-[8px] py-[4px] -mx-[8px] -my-[4px] rounded-[8px] bg-transparent border-none font-[inherit] text-[12.5px] font-semibold text-acc whitespace-nowrap cursor-pointer no-underline " +
  "[transition:background-color_160ms_ease,color_160ms_ease] hover:bg-acc-soft hover:text-txt " +
  "focus-visible:outline-2 focus-visible:outline-acc focus-visible:outline-offset-2";

export function EnvHeaderLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className={ENV_HEADER_LINK}>
      {children}
      <Icon name="chevron" size={11} />
    </Link>
  );
}

/** Plan / tier pill on a row (MAX reads green, every other tier neutral). */
export function EnvPill({ tone, children, small = false }: { tone: "good" | "bad" | "warn" | "muted"; children: ReactNode; small?: boolean }) {
  return (
    <span
      className={cn(
        "font-bold rounded-full whitespace-nowrap shrink-0 uppercase",
        small ? "text-[9.5px] px-[6px] py-[2px]" : "text-[10.5px] px-[8px] py-[3px]",
        { good: "bg-green-soft text-green", bad: "bg-red-soft text-red", warn: "bg-amber-soft text-amber", muted: "bg-card-3 text-txt-3" }[tone],
      )}
    >
      {children}
    </span>
  );
}

/**
 * Inner content of an Environment control button: icon, stacked micro-label + value, an optional
 * trailing accessory (plan badge, @username), and a chevron. The button itself belongs to the DropdownMenu.
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

/** Static (non-dropdown) Environment row, e.g. an attached secret: `trailing` carries its status pill(s). */
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
    <img src={icon.src} alt={icon.alt} width={32} height={32} className="shrink-0 w-[32px] h-[32px] object-contain" />
  );
}

function EnvRowLabel({ label, value }: { label: string; value: ReactNode }) {
  return (
    <span className="flex-1 flex flex-col items-start leading-[1.3] min-w-0">
      <span className="text-[11px] text-txt-4 whitespace-nowrap">{label}</span>
      <span className="block text-[13.5px] font-semibold text-txt max-w-full truncate">{value}</span>
    </span>
  );
}
