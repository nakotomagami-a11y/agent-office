// Persists per-instance chat transcripts to the server DB via /api/transcripts.
// Keyed by `<agentId>::<instanceId>`. Async - callers must await or fire-and-forget.

import { API_ROUTES } from "@agent-office/domain/config/routes";
import { apiClient } from "@/lib/api-client";
import type { ThreadItem } from "./thread-types";

const MAX_ITEMS_PER_KEY = 5000;

export interface QueuedMessage {
  id: string;
  text: string;
}

export interface Transcript {
  items: ThreadItem[];
  activeRunId?: string | null;
  sessionId?: string | null;
  /**
   * Messages the user typed while a run was still in flight. Kept alongside
   * the transcript so a reload, worktree switch, or app crash mid-run doesn't
   * drop queued turns on the floor. Empty array = no pending work.
   */
  queuedMessages?: QueuedMessage[];
  updatedAt: number;
}

export function transcriptKey(agentId: string, instanceId?: string | null): string {
  const slot = instanceId && instanceId.length > 0 ? instanceId : "default";
  return `${agentId}::${slot}`;
}

function parseKey(key: string): { agentId: string; instanceId: string } {
  const idx = key.indexOf("::");
  if (idx === -1) return { agentId: key, instanceId: "default" };
  return { agentId: key.slice(0, idx), instanceId: key.slice(idx + 2) || "default" };
}

function freeze(items: ThreadItem[]): ThreadItem[] {
  return items.map((it) => {
    if (it.kind === "agent-text" && it.streaming) return { ...it, streaming: false };
    return it;
  });
}

/**
 * Upgrade transcripts persisted before run errors moved to codes. Old
 * `system-error` items carry a free-form `message` and no `code`, which would
 * render as `errors.run.undefined.*`. Map them to the code shape so historic
 * threads still render — the legacy text becomes (capped) `detail`.
 */
function migrateLegacyErrors(items: ThreadItem[]): ThreadItem[] {
  return items.map((it) => {
    if (it.kind !== "system-error") return it;
    const raw = it as { kind: "system-error"; id: string; code?: unknown; message?: unknown; detail?: string; interrupted?: boolean };
    if (typeof raw.code === "string") return it;
    const legacy = typeof raw.message === "string" ? raw.message.trim() : undefined;
    return {
      kind: "system-error" as const,
      id: raw.id,
      code: raw.interrupted ? "stopped" : "unknown",
      detail: legacy ? (legacy.length > 300 ? `${legacy.slice(0, 297)}…` : legacy) : undefined,
      interrupted: raw.interrupted,
    };
  });
}

function parseQueuedMessages(raw: string | null | undefined): QueuedMessage[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (entry): entry is QueuedMessage =>
        typeof entry === "object" && entry !== null &&
        typeof (entry as QueuedMessage).id === "string" &&
        typeof (entry as QueuedMessage).text === "string",
    );
  } catch {
    return [];
  }
}

export async function loadTranscript(key: string): Promise<Transcript | null> {
  const { agentId, instanceId } = parseKey(key);
  try {
    const res = await apiClient.get<{
      items: string;
      activeRunId?: string | null;
      sessionId?: string | null;
      queuedMessages?: string | null;
      updatedAt?: number;
    } | null>(
      API_ROUTES.transcripts,
      { params: { agentId, instanceId } },
    );
    const data = res.data;
    if (!data) return null;
    let items: ThreadItem[] = [];
    try { items = migrateLegacyErrors(JSON.parse(data.items) as ThreadItem[]); } catch { items = []; }
    return {
      items,
      activeRunId: data.activeRunId ?? null,
      sessionId: data.sessionId ?? null,
      queuedMessages: parseQueuedMessages(data.queuedMessages),
      updatedAt: data.updatedAt ?? Date.now(),
    };
  } catch {
    return null;
  }
}

export async function saveTranscript(
  key: string,
  items: ThreadItem[],
  activeRunId: string | null = null,
  sessionId?: string | null,
  queuedMessages: QueuedMessage[] = [],
): Promise<void> {
  const { agentId, instanceId } = parseKey(key);
  try {
    await apiClient.put(
      API_ROUTES.transcripts,
      {
        items: JSON.stringify(freeze(items).slice(-MAX_ITEMS_PER_KEY)),
        activeRunId: activeRunId ?? null,
        sessionId: sessionId !== undefined ? sessionId : null,
        queuedMessages: JSON.stringify(queuedMessages),
      },
      { params: { agentId, instanceId } },
    );
  } catch { /* best-effort */ }
}

export async function clearTranscript(key: string): Promise<void> {
  const { agentId, instanceId } = parseKey(key);
  try {
    await apiClient.delete(API_ROUTES.transcripts, { params: { agentId, instanceId } });
  } catch { /* best-effort */ }
}
