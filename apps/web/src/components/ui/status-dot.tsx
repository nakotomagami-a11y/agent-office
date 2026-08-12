import type { CSSProperties, HTMLAttributes } from "react";
import { cn } from "@/lib/cn";
import { getStatusMeta, type AgentStatus } from "./status-dot-colors";

export type StatusDotProps = Omit<HTMLAttributes<HTMLSpanElement>, "children"> & {
  status: AgentStatus;
  /** Override label text; falls back to the canonical English label. */
  label?: string;
  /** Hide the text portion - render only the dot. */
  hideLabel?: boolean;
  /** Pixel size for the dot. Defaults to 8px (matches v3 inline styles). */
  size?: number;
};

/**
 * Coloured status pip + uppercase mono label. Mirrors the v3 `StatusDot`.
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
    background: meta.color,
    boxShadow: meta.pulse ? `0 0 0 3px color-mix(in srgb, ${meta.color} 20%, transparent)` : "none",
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
      <span style={dotStyle} aria-hidden />
      {hideLabel ? null : text}
    </span>
  );
}
