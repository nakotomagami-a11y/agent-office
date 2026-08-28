import type { CSSProperties, HTMLAttributes } from "react";
import { cn } from "@/lib/cn";
import { getStatusMeta, type AgentStatus } from "./status-dot-colors";

export type StatusDotProps = Omit<HTMLAttributes<HTMLSpanElement>, "children"> & {
  status: AgentStatus;
  /** Override label text; falls back to the canonical English label. */
  label?: string;
  /** Hide the text portion - render only the dot. */
  hideLabel?: boolean;
  /** Pixel size for the dot. Defaults to 8px. */
  size?: number;
};

/**
 * Coloured status pip + uppercase mono label.
 * Decorative when `hideLabel` is true; the `title` and `aria-label` still
 * carry the status so the dot remains an accessible signal.
 */
export function StatusDot({
  status,
  label,
  hideLabel = false,
  size = 8,
  className,
  style,
  ...rest
}: StatusDotProps) {
  const meta = getStatusMeta(status);
  const text = label ?? meta.defaultLabel;

  const dotStyle: CSSProperties = {
    display: "inline-block",
    width: size,
    height: size,
    borderRadius: "50%",
    boxShadow: meta.pulse ? `0 0 0 3px color-mix(in srgb, var(${meta.cssVar}) 20%, transparent)` : "none",
    animation: meta.pulse ? "pulseDot 1.8s infinite" : undefined,
    flex: "none",
  };

  return (
    <span
      className={cn("inline-flex items-center gap-[5px] text-txt-3 uppercase text-[10.5px] font-mono tracking-[0.04em]", className)}
      style={style}
      title={text}
      aria-label={hideLabel ? text : undefined}
      {...rest}
    >
      <span className={meta.bgClass} style={dotStyle} aria-hidden />
      {hideLabel ? null : text}
    </span>
  );
}
