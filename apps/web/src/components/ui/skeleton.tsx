import { cn } from "@/lib/cn";

export type SkeletonProps = {
  width?: number | string;
  height?: number | string;
  rounded?: number | string;
  className?: string;
  /** Mark as decorative - caller should add a `role="status"` wrapper if needed. */
  ariaHidden?: boolean;
};

export function Skeleton({ width = "100%", height = 16, rounded = 6, className, ariaHidden = true }: SkeletonProps) {
  return (
    <span
      aria-hidden={ariaHidden}
      className={cn(
        "ao-skeleton inline-block bg-[linear-gradient(90deg,var(--bg-2)_0%,var(--bg-3)_50%,var(--bg-2)_100%)] [background-size:200%_100%] [animation:ao-skel-pulse_1.4s_ease-in-out_infinite]",
        className,
      )}
      style={{ width, height, borderRadius: rounded }}
    />
  );
}
