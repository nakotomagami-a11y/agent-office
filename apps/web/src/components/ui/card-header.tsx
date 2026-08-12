import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/cn";

export type CardHeaderProps = Omit<HTMLAttributes<HTMLDivElement>, "title"> & {
  title: ReactNode;
  /** Secondary text (mono, muted) shown next to the title. */
  sub?: ReactNode;
  /** Right-aligned slot for actions, buttons, etc. */
  right?: ReactNode;
};

/**
 * `.card-h` - title + optional sub + optional right-side action slot.
 * Mirrors v3 markup exactly so the existing CSS adopts it without changes.
 */
export function CardHeader({
  title,
  sub,
  right,
  className,
  ...rest
}: CardHeaderProps) {
  return (
    <div className={cn("border-b border-line flex items-center gap-[10px] px-4 py-3", className)} {...rest}>
      <span className="font-bold text-[13px]">{title}</span>
      {sub ? <span className="text-txt-3 text-[11.5px] font-[var(--font-mono)]">{sub}</span> : null}
      {right ? <div className="ml-auto">{right}</div> : null}
    </div>
  );
}
