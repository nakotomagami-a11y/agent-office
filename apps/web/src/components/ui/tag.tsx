import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/cn";

export type TagVariant = "default" | "skill" | "name" | "project";

export type TagProps = HTMLAttributes<HTMLSpanElement> & {
  variant?: TagVariant;
  children: ReactNode;
};

export function Tag({
  variant = "default",
  className,
  children,
  ...rest
}: TagProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 bg-bg-2 border border-line rounded-full text-txt-2 px-2 py-0.5 text-[11px] font-mono",
        variant === "skill" && "bg-acc-faint text-acc border-acc-line",
        (variant === "name" || variant === "project") && "h-6 px-[9px] py-0 align-middle font-sans text-[13px] font-bold",
        variant === "name" && "bg-card-3 border-edge-2 text-txt",
        variant === "project" && "bg-acc-soft border-transparent text-acc",
        className,
      )}
      {...rest}
    >
      {children}
    </span>
  );
}
