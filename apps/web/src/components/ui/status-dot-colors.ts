import type { AgentStatus } from "@agent-office/domain/types";

export type { AgentStatus };

export type StatusMeta = {
  /** Tailwind background class for the dot fill. */
  bgClass: string;
  /** CSS custom property name (e.g. "--working") backing the same token, for the pulse glow's color-mix(). */
  cssVar: string;
  /** Whether to render a pulsing halo. */
  pulse: boolean;
  /** Default human label (untranslated). Callers should pass their own when i18n matters. */
  defaultLabel: string;
};

const STATUS_MAP: Record<AgentStatus, StatusMeta> = {
  working: { bgClass: "bg-status-working", cssVar: "--working", pulse: true, defaultLabel: "working" },
  thinking: { bgClass: "bg-status-thinking", cssVar: "--thinking", pulse: true, defaultLabel: "thinking" },
  done: { bgClass: "bg-status-done", cssVar: "--done", pulse: false, defaultLabel: "done" },
  queued: { bgClass: "bg-status-queued", cssVar: "--queued", pulse: false, defaultLabel: "queued" },
  error: { bgClass: "bg-status-error", cssVar: "--error", pulse: false, defaultLabel: "error" },
  idle: { bgClass: "bg-status-idle", cssVar: "--idle", pulse: false, defaultLabel: "idle" },
};

export function getStatusMeta(status: AgentStatus): StatusMeta {
  return STATUS_MAP[status];
}
