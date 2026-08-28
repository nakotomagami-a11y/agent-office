import Link from "next/link";
import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * Accent (purple) button — the raised, glowing look shared by the primary
 * `<Button>` variant and every bare `<button>`/`<a>` that wants the same CTA
 * treatment. Pure Tailwind so the style stays co-located with the markup; apply
 * via `cn()` or string interpolation. Conflicting base classes are resolved by
 * tailwind-merge (last wins), so passing this after a base string overrides
 * bg/shadow.
 */
/* Primary button: acc→acc-2 gradient, glow shadow derived from --acc so it
   re-tints with the theme automatically instead of a hardcoded color. */
export const ACCENT_BTN =
  "text-[var(--acc-ink)] border border-transparent " +
  "bg-[linear-gradient(120deg,var(--acc-cta),var(--acc-2))] " +
  "shadow-[0_5px_16px_-4px_color-mix(in_srgb,var(--acc)_55%,transparent),inset_0_1px_0_rgba(255,255,255,0.26)] " +
  "transition-[filter,transform,box-shadow] duration-150 " +
  "hover:brightness-[1.07] hover:-translate-y-px " +
  "hover:shadow-[0_8px_22px_-6px_color-mix(in_srgb,var(--acc)_62%,transparent),inset_0_1px_0_rgba(255,255,255,0.3)] " +
  "active:translate-y-0 active:brightness-[0.97] " +
  "disabled:bg-none disabled:bg-bg-3 disabled:border-line disabled:text-txt-3 disabled:shadow-none disabled:brightness-100 disabled:translate-y-0 disabled:cursor-not-allowed";

const BASE =
  "h-8 px-3 inline-flex items-center gap-[7px] bg-bg-1 border border-line-2 rounded-[var(--r-md)] font-[inherit] text-[13px] text-txt cursor-pointer shadow-1 hover:bg-bg-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-acc";

const VARIANTS: Record<string, string> = {
  default: "",
  primary: ACCENT_BTN,
  ghost: "bg-transparent border-transparent shadow-none hover:bg-bg-2",
  danger: "bg-[var(--error)] text-white border-[var(--error)]",
};

const SIZES: Record<string, string> = {
  default: "",
  sm: "h-[26px] px-[9px] text-[12px] gap-[5px] rounded-[8px]",
};

type ButtonBaseProps = {
  variant?: "default" | "primary" | "ghost" | "danger";
  size?: "default" | "sm";
  children?: ReactNode;
  className?: string;
};

type AsButton = ButtonBaseProps &
  ButtonHTMLAttributes<HTMLButtonElement> & { href?: undefined };

type AsLink = ButtonBaseProps &
  AnchorHTMLAttributes<HTMLAnchorElement> & { href: string };

export type ButtonProps = AsButton | AsLink;

export function Button({ variant = "default", size = "default", className, ...rest }: ButtonProps) {
  const classes = cn(BASE, VARIANTS[variant], SIZES[size], className);

  if ("href" in rest && rest.href !== undefined) {
    const { href, ...anchorRest } = rest as AsLink;
    return (
      <Link href={href} className={classes} {...anchorRest} />
    );
  }

  return (
    <button
      type={(rest as AsButton).type ?? "button"}
      className={classes}
      {...(rest as AsButton)}
    />
  );
}
