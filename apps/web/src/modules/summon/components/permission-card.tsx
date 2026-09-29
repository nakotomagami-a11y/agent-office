"use client";

import { FlagCard } from "./flag-card";
import type { PendingPermission } from "../hooks/use-pending-permissions";

/** Best-effort one-line summary of what the agent is asking to do. */
function summarise(tool: string, input: unknown): string {
  if (input && typeof input === "object") {
    const o = input as Record<string, unknown>;
    for (const k of ["command", "file_path", "path", "url", "pattern"]) {
      if (typeof o[k] === "string" && o[k]) return String(o[k]);
    }
  }
  return typeof input === "string" ? input : tool;
}

/**
 * A tool call the agent cannot make without approval.
 *
 * The run is BLOCKED while this is on screen — it is the only card in the
 * thread where not answering has a cost. The server denies it after its own
 * timeout, so an ignored prompt fails closed rather than hanging forever.
 */
export function PermissionCard({
  request,
  onDecide,
}: {
  request: PendingPermission;
  onDecide: (id: string, decision: "allow" | "deny") => void;
}) {
  return (
    <FlagCard
      tone="warn"
      icon="lock"
      title="Permission needed"
      pill={request.tool}
      body="The agent is paused until you answer. Unanswered requests are denied automatically."
      detail={summarise(request.tool, request.input)}
      actions={[
        { key: "allow", label: "Approve", tone: "primary", onClick: () => onDecide(request.id, "allow") },
        { key: "deny", label: "Deny", tone: "danger", onClick: () => onDecide(request.id, "deny") },
      ]}
    />
  );
}
