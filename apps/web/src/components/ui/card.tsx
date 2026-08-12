import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/cn";

export type CardProps = HTMLAttributes<HTMLDivElement> & {
  children: ReactNode;
};

/**
 * Bare `.card` container. Pair with `<CardHeader>` and any body content.
 * Body padding is intentionally not baked in - different cards need different
 * paddings (table cards bleed, prose cards pad).
 */
export function Card({ className, children, ...rest }: CardProps) {
  return (
    <div className={cn("bg-bg-1 border border-line rounded-[var(--r-lg)] shadow-1", className)} {...rest}>
      {children}
    </div>
  );
}
