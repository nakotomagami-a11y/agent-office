import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/cn";

export type TagVariant = "default" | "skill";

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
        variant === "skill" && "bg-acc-faint text-acc border-[rgba(233,84,32,0.2)]",
        className,
      )}
      {...rest}
    >
      {children}
    </span>
  );
}
