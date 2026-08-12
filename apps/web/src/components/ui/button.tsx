import Link from "next/link";
import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/cn";
import { ACCENT_BTN } from "@/lib/button-styles";

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
