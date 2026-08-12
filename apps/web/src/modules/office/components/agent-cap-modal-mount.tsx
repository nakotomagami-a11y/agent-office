"use client";

import { useAgentCapStore } from "../hooks/use-agent-cap-store";
import { AgentCapModal } from "./agent-cap-modal";

/**
 * Mount-once wrapper that reads the cap-modal store and forwards the
 * appropriate props to `<AgentCapModal>`. Kept as a separate mount so
 * the modal component itself stays pure and prop-driven (easier to test).
 */
export function AgentCapModalMount() {
  const state = useAgentCapStore((s) => s.state);

  if (state.kind === "closed") return null;
  if (state.kind === "soft") {
    return <AgentCapModal open kind="soft" onConfirm={state.onConfirm} onCancel={state.onCancel} />;
  }
  return <AgentCapModal open kind="hard" onDismiss={state.onDismiss} />;
}
