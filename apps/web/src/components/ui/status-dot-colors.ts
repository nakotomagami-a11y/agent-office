export type AgentStatus =
  | "idle"
  | "working"
  | "thinking"
  | "done"
  | "queued"
  | "error";

export type StatusMeta = {
  /** CSS color variable for the dot fill. */
  color: string;
  /** Whether to render a pulsing halo. */
  pulse: boolean;
  /** Default human label (untranslated). Callers should pass their own when i18n matters. */
  defaultLabel: string;
};

const STATUS_MAP: Record<AgentStatus, StatusMeta> = {
  working: { color: "var(--working)", pulse: true, defaultLabel: "working" },
  thinking: { color: "var(--thinking)", pulse: true, defaultLabel: "thinking" },
  done: { color: "var(--done)", pulse: false, defaultLabel: "done" },
  queued: { color: "var(--queued)", pulse: false, defaultLabel: "queued" },
  error: { color: "var(--error)", pulse: false, defaultLabel: "error" },
  idle: { color: "var(--idle)", pulse: false, defaultLabel: "idle" },
};

export function getStatusMeta(status: AgentStatus): StatusMeta {
  return STATUS_MAP[status];
}
