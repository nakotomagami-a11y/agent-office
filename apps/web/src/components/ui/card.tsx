import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/cn";

export type CardProps = HTMLAttributes<HTMLDivElement> & {
  children: ReactNode;
};

/**
 * Bare `.card` container. Pair with `<CardHeader>` and any body content.
 * Body padding is intentionally not baked in - different cards need different
 * paddings (table cards bleed, prose cards pad). Surface is gradient fill +
 * gradient-border sheen + elevation shadow (see `.surface-sheen` / --lift).
 */
export function Card({ className, children, ...rest }: CardProps) {
  return (
    <div className={cn("surface-sheen rounded-[var(--r-lg)] shadow-[var(--lift)]", className)} {...rest}>
      {children}
    </div>
  );
}
