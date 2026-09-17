// Chat is now server-authoritative (see docs/chat-refactor.md): the thread,
// active run, and queued messages live in the `conversations` / `queued_messages`
// tables and are read through the conversation hooks. The old client-side
// transcript persistence (load/save/clear over /api/transcripts) that used to
// live here is gone — nothing called it after the refactor.
//
// The one thing that survived is the slot-key helper, still used as a stable
// React key + cache key for an (agent, instance) chat slot.

/** Stable `<agentId>::<instanceId>` key for an (agent, instance) chat slot. */
export function transcriptKey(agentId: string, instanceId?: string | null): string {
  const slot = instanceId && instanceId.length > 0 ? instanceId : "default";
  return `${agentId}::${slot}`;
}
