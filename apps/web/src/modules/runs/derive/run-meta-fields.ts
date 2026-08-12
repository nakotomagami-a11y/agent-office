import type { PersistedRun } from "@agent-office/domain/types";
import { fmtTok } from "../format/activity-formatters";
import { formatCost, formatDuration } from "../format/format-run-meta";

export interface RunMetaField {
  l: string;
  v: string;
}

export function buildRunMetaFields(run: PersistedRun): RunMetaField[] {
  const tokens = run.tokensIn + run.tokensOut;
  return [
    { l: "run id", v: run.id.slice(0, 12) + "…" },
    { l: "duration", v: formatDuration(run.durMs) },
    { l: "tokens", v: fmtTok(tokens) },
    { l: "cost", v: formatCost(run.cost) },
    { l: "model", v: run.model || "default" },
    { l: "effort", v: run.effort || "default" },
    ...(run.cwd ? [{ l: "cwd", v: run.cwd }] : []),
  ];
}
